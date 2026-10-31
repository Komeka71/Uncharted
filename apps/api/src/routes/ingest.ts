import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { parseJUnitXml, parseJestJson } from '@origin/core';
import { getDb, isDbConnected } from '../db/client.js';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { env } from '../config/env.js';

const router = Router();
router.use(createRateLimiter({ windowMs: 60000, max: 60, message: 'Too many ingestion requests, please slow down.' }));
const offlineIngestDedupeCache = new Set<string>();

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

  const expectedTokens: string[] = [];
  if (isDbConnected()) {
    const db = getDb();
    const project = await db.collection('projects').findOne({
      $or: [{ projectId }, { _id: projectId as any }]
    });
    if (!project) {
      return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` } });
    }
    if (project.ingestToken) {
      expectedTokens.push(project.ingestToken);
    }
  }

  const originToken = process.env.ORIGIN_TOKEN || env.ORIGIN_TOKEN;
  if (originToken) {
    expectedTokens.push(originToken);
  }

  if (expectedTokens.length > 0) {
    const ok = expectedTokens.some((t) => authHeader === `Bearer ${t}`);
    if (!ok) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing bearer token' } });
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

  // Idempotency: sha256(generic + projectId + externalId)
  const eventId = crypto
    .createHash('sha256')
    .update(`generic:${projectId}:${run.externalId}`)
    .digest('hex');

  if (isDbConnected()) {
    const db = getDb();
    try {
      await db.collection('ingestEvents').insertOne({
        eventId,
        projectId,
        source: 'generic',
        type: 'run',
        status: 'received',
        receivedAt: new Date()
      });
    } catch (err: any) {
      if (err.code === 11000) {
        return res.status(200).json({
          duplicate: true,
          success: true,
          runId,
          message: 'Run event already ingested and processed'
        });
      }
    }
  } else {
    if (offlineIngestDedupeCache.has(eventId)) {
      return res.status(200).json({
        duplicate: true,
        success: true,
        runId,
        message: 'Run event already ingested and processed (offline cache)'
      });
    }
    offlineIngestDedupeCache.add(eventId);
    if (offlineIngestDedupeCache.size > 1000) {
      const first = offlineIngestDedupeCache.values().next().value;
      if (first) offlineIngestDedupeCache.delete(first);
    }
  }

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

  // Run deterministic analysis only for failed runs with sufficient evidence
  const isFailure = run.status.toLowerCase().includes('fail');
  let diagnosisResult = null;
  if (isFailure && log && log.trim().length > 0) {
    // Idempotency: reuse existing diagnosis for the same run if present
    let existingFailure: any = null;
    if (isDbConnected()) {
      const db = getDb();
      existingFailure = await db.collection('failures').findOne({ projectId, runId });
    }
    if (existingFailure?.diagnosisId) {
      const db = getDb();
      const diag = await db.collection('diagnoses').findOne({ diagnosisId: existingFailure.diagnosisId });
      diagnosisResult = diag;
    } else {
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
  }

  if (isDbConnected()) {
    try {
      const db = getDb();
      await db.collection('ingestEvents').updateOne(
        { eventId },
        { $set: { status: 'processed', processedAt: new Date() } }
      );
    } catch (e) {}
  }

  return res.status(200).json({
    success: true,
    runId,
    testsProcessed: normalizedTests.length,
    diagnosis: diagnosisResult
  });
});

export default router;
