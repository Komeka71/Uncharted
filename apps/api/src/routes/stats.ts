import { Router, Request, Response } from 'express';
import { getDb, isDbConnected } from '../db/client.js';
import {
  aggregateTopRecurringFailures,
  aggregateCategoryTrends,
  aggregateMttr,
  aggregateFlakyTests,
  aggregateRecurringRate
} from '../aggregations/index.js';
import { reconcileSignatureStatuses } from '../history/historyService.js';

const router = Router();

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const projectId = (req.query.projectId as string) || 'demo-shop';

    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DB_OFFLINE',
          message: 'Dashboard statistics require MongoDB. Check the API logs for the connection failure.'
        }
      });
    }

    const db = getDb();
    await reconcileSignatureStatuses(db, projectId);

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const [
      topRecurring,
      categoryTrends,
      mttrStats,
      flakyStats,
      recurringRateResult,
      totalFailures7d,
      failureRuns
    ] = await Promise.all([
      aggregateTopRecurringFailures(db, projectId, 7, 5),
      aggregateCategoryTrends(db, projectId, 14),
      aggregateMttr(db, projectId, 7),
      aggregateFlakyTests(db, projectId, Number.MAX_SAFE_INTEGER),
      aggregateRecurringRate(db, projectId, 7),
      db.collection('failures').countDocuments({
        projectId,
        createdAt: { $gte: since }
      }),
      db.collection('failures').find(
        { projectId, createdAt: { $gte: since } },
        { projection: { runId: 1 } }
      ).toArray()
    ]);

    const runIds = [...new Set(failureRuns.map((failure) => failure.runId).filter(Boolean))];
    const runs = runIds.length
      ? await db.collection('runs').find(
          { projectId, runId: { $in: runIds } },
          { projection: { workflow: 1 } }
        ).toArray()
      : [];
    const workflowCount = new Set(runs.map((run) => run.workflow).filter(Boolean)).size;
    const flakyCount = flakyStats.filter((test) => test.verdict === 'flaky').length;

    return res.json({
      kpis: {
        totalFailures7d,
        workflowCount,
        recurringRatePct: recurringRateResult.recurringRatePct,
        flakyTestsCount: flakyCount,
        mttrHours: mttrStats.averageMttrHours
      },
      topRecurring,
      categoryTrends,
      flakyCount
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'STATS_ERROR', message: err.message } });
  }
});

export default router;
