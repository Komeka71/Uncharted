import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { parseJUnitXml, parseJestJson } from '@culprit/core';
import { getDb, isDbConnected } from '../db/client.js';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';

const router = Router();

const IngestSchema = z.object({
  run: z.object({
    externalId: z.string().min(1),
    branch: z.string().min(1),
    sha: z.string().min(1),
    workflow: z.string().min(1),
    status: z.string().min(1),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    url: z.string().optional()
  }),
  log: z.string().optional(),
  tests: z.union([z.string(), z.array(z.any())]).optional(),
  format: z.enum(['junit', 'jest', 'pytest-junit']).optional()
});

router.post('/:projectId', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const authHeader = req.headers.authorization;

  // Validate bearer token if project exists in DB
  if (isDbConnected()) {
    const db = getDb();
    const project = await db.collection('projects').findOne({ projectId });
    if (project && project.ingestToken) {
      const expectedBearer = `Bearer ${project.ingestToken}`;
      if (!authHeader || authHeader !== expectedBearer) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing project bearer token' } });
      }
    }
  }

  const parseResult = IngestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid ingest payload schema'
      }
    });
  }

  const { run, log, tests, format } = parseResult.data;
  const runId = `generic:${projectId}:${run.externalId}`;
  const headSha = run.sha;

  // Handle test results if provided
  let normalizedTests: any[] = [];
  if (tests) {
    try {
      if (typeof tests === 'string') {
        if (format === 'jest' || tests.trim().startsWith('{')) {
          normalizedTests = parseJestJson(tests);
        } else {
          normalizedTests = parseJUnitXml(tests);
        }
      } else if (Array.isArray(tests)) {
        normalizedTests = tests;
      }
    } catch (err: any) {
      // Clear 400 for malformed test input as per requirement!
      return res.status(400).json({
        error: {
          code: 'MALFORMED_TEST_RESULTS',
          message: err.message || 'Failed to parse test results with the specified format'
        }
      });
    }
  }

  if (isDbConnected()) {
    const db = getDb();

    // Insert or update run
    await db.collection('runs').updateOne(
      { projectId, runId },
      {
        $set: {
          projectId,
          runId,
          workflow: run.workflow,
          branch: run.branch,
          headSha,
          status: 'completed',
          conclusion: run.status.toLowerCase().includes('fail') ? 'failure' : 'success',
          startedAt: run.startedAt ? new Date(run.startedAt) : new Date(),
          completedAt: run.completedAt ? new Date(run.completedAt) : new Date(),
          durationMs: 45000,
          url: run.url || ''
        }
      },
      { upsert: true }
    );

    // Insert testResults documents
    if (normalizedTests.length > 0) {
      const testDocs = normalizedTests.map((t) => {
        const eventId = crypto
          .createHash('sha256')
          .update(`${projectId}:${runId}:${t.testId}:${t.outcome}`)
          .digest('hex');
        return {
          eventId,
          projectId,
          runId,
          headSha,
          testId: t.testId,
          file: t.file || 'test',
          outcome: t.outcome,
          durationMs: t.durationMs || 0,
          errorMessage: t.errorMessage || null,
          ts: new Date()
        };
      });

      for (const doc of testDocs) {
        try {
          await db.collection('testResults').updateOne(
            { eventId: doc.eventId },
            { $set: doc },
            { upsert: true }
          );
        } catch (err) {
          // ignore duplicate
        }
      }
    }
  }

  // If failing log is included, run deterministic analysis
  let diagnosisResult = null;
  if (log && log.trim().length > 0) {
    const failureId = `fail_${crypto.randomBytes(6).toString('hex')}`;
    const result = await orchestrateAnalysis({
      failureId,
      projectId,
      runId,
      jobName: 'ci',
      rawLog: log
    });
    diagnosisResult = result.diagnosis;
  }

  return res.status(200).json({
    success: true,
    runId,
    testsProcessed: normalizedTests.length,
    diagnosis: diagnosisResult
  });
});

export default router;
