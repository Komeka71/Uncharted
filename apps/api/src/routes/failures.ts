import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb, isDbConnected } from '../db/client.js';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';

const router = Router();

// List failures
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId, category, status, days } = req.query;
    const query: any = {};
    if (projectId) query.projectId = projectId;
    if (category) query.category = category;
    if (status) query.status = status;

    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DB_OFFLINE',
          message: 'Failure records require MongoDB. Check the API logs for the connection failure.'
        }
      });
    }

    if (days) {
      const daysValue = Number(days);
      if (Number.isFinite(daysValue) && daysValue > 0) {
        const since = new Date();
        since.setDate(since.getDate() - daysValue);
        query.createdAt = { $gte: since };
      }
    }

    const db = getDb();
    const failures = await db
      .collection('failures')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    const total = await db.collection('failures').countDocuments(query);

    const runs = failures.length
      ? await db.collection('runs').find({
          projectId: { $in: [...new Set(failures.map((failure: any) => failure.projectId))] },
          runId: { $in: [...new Set(failures.map((failure: any) => failure.runId))] }
        }).toArray()
      : [];
    const runWorkflows = new Map(runs.map((run) => [`${run.projectId}:${run.runId}`, run.workflow]));

    const enriched = await Promise.all(
      failures.map(async (f: any) => {
        const sig = await db.collection('signatures').findOne({
          projectId: f.projectId,
          signature: f.signature
        });
        const diag = f.diagnosisId
          ? await db.collection('diagnoses').findOne({ diagnosisId: f.diagnosisId })
          : null;

        return {
          failureId: f.failureId,
          projectId: f.projectId,
          runId: f.runId,
          workflow: runWorkflows.get(`${f.projectId}:${f.runId}`) || 'Unknown workflow',
          jobName: f.jobName,
          stepName: f.stepName,
          category: f.category,
          ruleId: f.ruleId,
          signature: f.signature,
          transient: f.transient,
          status: f.status,
          createdAt: f.createdAt,
          occurrences: sig?.occurrences || 1,
          isRegression: sig?.status === 'regressed' || (sig?.regressionCount || 0) > 0,
          summary: diag?.summary || f.ruleId,
          confidence: diag?.confidence || 'high'
        };
      })
    );

    return res.json({ failures: enriched, total });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'FAILURES_LIST_ERROR', message: err.message } });
  }
});

// Get failure detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      const db = getDb();
      const failure = await db.collection('failures').findOne({ failureId: id });
      if (!failure) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Failure ${id} not found` } });
      }

      const diagnosis = failure.diagnosisId
        ? await db.collection('diagnoses').findOne({ diagnosisId: failure.diagnosisId })
        : null;

      const agentSteps = await db
        .collection('agentSteps')
        .find({ failureId: id })
        .sort({ seq: 1 })
        .toArray();

      const signature = await db.collection('signatures').findOne({
        projectId: failure.projectId,
        signature: failure.signature
      });

      const run = await db.collection('runs').findOne({ runId: failure.runId });
      const logDoc = await db.collection('logs').findOne({ runId: failure.runId, jobName: failure.jobName });

      return res.json({
        failure,
        diagnosis,
        agentSteps,
        signature,
        run,
        logLines: logDoc?.lines || failure.evidence || []
      });
    }

    return res.status(503).json({
      error: {
        code: 'DB_OFFLINE',
        message: 'Failure records require MongoDB. Check the API logs for the connection failure.'
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'FAILURE_DETAIL_ERROR', message: err.message } });
  }
});

// Feedback (thumbs up / down)
const FeedbackSchema = z.object({
  vote: z.enum(['up', 'down']),
  note: z.string().optional()
});

router.post('/:id/feedback', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parse = FeedbackSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: { code: 'INVALID_FEEDBACK', message: parse.error.errors[0]?.message } });
    }

    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DB_OFFLINE',
          message: 'Failure feedback cannot be saved without MongoDB. Check the API logs for the connection failure.'
        }
      });
    }

    const db = getDb();
    await db.collection('diagnoses').updateOne(
      { failureId: id },
      {
        $set: {
          feedback: {
            vote: parse.data.vote,
            note: parse.data.note,
            updatedAt: new Date()
          }
        }
      }
    );

    return res.json({ success: true, message: 'Feedback recorded successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'FEEDBACK_ERROR', message: err.message } });
  }
});

// Reanalyze failure
router.post('/:id/reanalyze', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      const db = getDb();
      const failure = await db.collection('failures').findOne({ failureId: id });
      if (!failure) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Failure not found' } });
      }

      const logDoc = await db.collection('logs').findOne({ runId: failure.runId, jobName: failure.jobName });
      const rawLog = logDoc ? logDoc.lines.map((l: any) => l.text).join('\n') : failure.evidence.map((e: any) => e.text).join('\n');

      const result = await orchestrateAnalysis({
        failureId: id,
        projectId: failure.projectId,
        runId: failure.runId,
        jobName: failure.jobName,
        rawLog
      });

      return res.json({ success: true, diagnosis: result.diagnosis });
    }

    return res.status(500).json({ error: { code: 'DB_OFFLINE', message: 'Database offline' } });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'REANALYZE_ERROR', message: err.message } });
  }
});

export default router;
