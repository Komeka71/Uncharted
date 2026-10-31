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

    if (isDbConnected()) {
      const db = getDb();

      // Ensure signature statuses are reconciled before computing metrics
      await reconcileSignatureStatuses(db, projectId);

      const [topRecurring, categoryTrends, mttrStats, flakyStats, recurringRateResult] = await Promise.all([
        aggregateTopRecurringFailures(db, projectId, 7, 5),
        aggregateCategoryTrends(db, projectId, 14),
        aggregateMttr(db, projectId),
        aggregateFlakyTests(db, projectId, 50),
        aggregateRecurringRate(db, projectId, 7)
      ]);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const totalFailures7d = await db.collection('failures').countDocuments({
        projectId,
        createdAt: { $gte: sevenDaysAgo }
      });

      const flakyCount = flakyStats.filter((t) => t.verdict === 'flaky').length;

      // Honest analytics: 0 is valid. Never replace 0 with fabricated fallback numbers!
      return res.json({
        kpis: {
          totalFailures7d,
          recurringRatePct: recurringRateResult.recurringRatePct,
          flakyTestsCount: flakyCount,
          mttrHours: mttrStats.averageMttrHours
        },
        topRecurring,
        categoryTrends,
        flakyCount,
        isDemoData: false
      });
    }

    // High fidelity fallback for demo mode ONLY when DB is disconnected
    return res.json({
      isDemoData: true,
      kpis: {
        totalFailures7d: 18,
        recurringRatePct: 44,
        flakyTestsCount: 3,
        mttrHours: 2.1
      },
      topRecurring: [
        {
          signature: 'a7b9c1d2e3f4051a',
          category: 'dependency',
          ruleId: 'npm-lock-out-of-sync',
          count: 6,
          lastSeenAt: new Date(),
          status: 'open',
          sampleEvidence: 'npm ci can only install packages when your package.json and package-lock.json are in sync.'
        },
        {
          signature: 'f4e3d2c1b0a98765',
          category: 'build_compile',
          ruleId: 'ts-compile-error',
          count: 4,
          lastSeenAt: new Date(Date.now() - 3600000),
          status: 'open',
          sampleEvidence: "src/services/authService.ts(45,21): error TS2339: Property 'role' does not exist"
        }
      ],
      categoryTrends: [
        { date: '2026-10-25', categories: { dependency: 2, test_failure: 1 }, total: 3 },
        { date: '2026-10-26', categories: { build_compile: 3, lint_format: 1 }, total: 4 },
        { date: '2026-10-27', categories: { dependency: 1, test_failure: 2 }, total: 3 },
        { date: '2026-10-28', categories: { config_env: 2, infra_runner: 1 }, total: 3 },
        { date: '2026-10-29', categories: { build_compile: 2, network_transient: 1 }, total: 3 },
        { date: '2026-10-30', categories: { dependency: 2, test_failure: 1 }, total: 3 },
        { date: '2026-10-31', categories: { build_compile: 1, docker_container: 1 }, total: 2 }
      ],
      flakyCount: 3
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'STATS_ERROR', message: err.message } });
  }
});

export default router;
