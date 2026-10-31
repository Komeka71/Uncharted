import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { getDb, isDbConnected } from '../db/client.js';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';

const router = Router();

const DEMO_LOGS: Record<string, string> = {
  'npm_lock_out_of_sync.log': [
    'Run npm ci',
    'npm ci can only install packages when your package.json and package-lock.json are in sync.',
    'Please update your lock file with npm install before continuing.'
  ].join('\n'),
  'ts_compile_error.log': [
    'Run TypeScript compiler',
    "src/services/authService.ts(45,21): error TS2339: Property 'role' does not exist on type 'SessionUser'.",
    'Process completed with exit code 2.'
  ].join('\n'),
  'env_var_missing.log': 'Error: Missing required environment variable STRIPE_SECRET_KEY',
  'test_timeout.log': 'FAIL tests/worker.test.ts - Expected the worker to finish before the timeout',
  'network_reset.log': 'Error: socket hang up (ECONNRESET)'
};

function loadFixture(filename: string): string {
  const fixture = DEMO_LOGS[filename];
  if (!fixture) {
    throw new Error(`Unknown demo log fixture: ${filename}`);
  }
  return fixture;
}

// Seed complete demo state
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    const projectId = 'demo-shop';

    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DB_OFFLINE',
          message: 'Demo data cannot be seeded without MongoDB. Check the API logs for the connection failure.'
        }
      });
    }

    const db = getDb();
    const now = Date.now();
    const shas = ['demo-sha-a', 'demo-sha-a', 'demo-sha-b', 'demo-sha-c', 'demo-sha-c', 'demo-sha-d', 'demo-sha-e', 'demo-sha-f'];
    const testCases = [
      {
        testId: 'Checkout › retries transient network requests',
        outcomes: ['pass', 'fail', 'pass', 'fail', 'pass', 'pass', 'fail', 'pass'],
        errorMessage: 'ECONNRESET while calling the checkout service'
      },
      {
        testId: 'Authentication › rejects expired refresh tokens',
        outcomes: ['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail'],
        errorMessage: 'Expected expired token to be rejected'
      },
      {
        testId: 'Orders › retries after a temporary database timeout',
        outcomes: ['pass', 'pass', 'fail', 'pass', 'pass', 'pass', 'pass', 'pass'],
        errorMessage: 'Timed out waiting for the database response'
      },
      {
        testId: 'Catalog › returns products in the requested order',
        outcomes: ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'],
        errorMessage: null
      }
    ];

    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          projectId,
          name: 'Culprit Demo Shop',
          repo: { owner: 'culprit-ci', name: 'culprit-demo-shop', provider: 'github' },
          webhookSecret: 'culprit_demo_secret_2026',
          ingestToken: 'clp_demo_token_xyz'
        },
        $setOnInsert: { createdAt: new Date(now - 14 * 86400000) }
      },
      { upsert: true }
    );

    const runs = shas.map((headSha, index) => {
      const startedAt = new Date(now - (shas.length - index) * 3600000);
      return {
        projectId,
        runId: `demo-run-${index + 1}`,
        workflow: index === 0 ? 'Dependency Validation' : index === 1 ? 'Build and Test' : 'Integration Tests',
        branch: 'main',
        headSha,
        event: 'push',
        actor: 'culprit-demo',
        status: 'completed',
        conclusion: index < 7 ? 'failure' : 'success',
        startedAt,
        completedAt: new Date(startedAt.getTime() + 180000),
        durationMs: 180000,
        url: `https://github.com/culprit-ci/culprit-demo-shop/actions/runs/${index + 1}`,
        prNumber: null
      };
    });

    for (const run of runs) {
      await db.collection('runs').updateOne(
        { projectId, runId: run.runId },
        { $setOnInsert: run },
        { upsert: true }
      );
    }

    const failureDefinitions = [
      {
        failureId: 'demo-failure-npm-1',
        runId: 'demo-run-1',
        jobName: 'npm ci',
        log: loadFixture('npm_lock_out_of_sync.log'),
        commits: [{
          sha: shas[0],
          author: 'Sarah Chen',
          message: 'update package dependencies',
          files: ['package.json', 'package-lock.json']
        }]
      },
      {
        failureId: 'demo-failure-npm-2',
        runId: 'demo-run-2',
        jobName: 'npm ci',
        log: loadFixture('npm_lock_out_of_sync.log'),
        commits: [{
          sha: shas[1],
          author: 'Sarah Chen',
          message: 'update package dependencies',
          files: ['package.json', 'package-lock.json']
        }]
      }
    ];

    for (const failure of failureDefinitions) {
      const existing = await db.collection('failures').findOne({ failureId: failure.failureId });
      if (existing) {
        await db.collection('failures').updateOne(
          { failureId: failure.failureId },
          { $set: { projectId, runId: failure.runId, jobName: failure.jobName } }
        );
        continue;
      }

      await orchestrateAnalysis({
        failureId: failure.failureId,
        projectId,
        runId: failure.runId,
        jobName: failure.jobName,
        rawLog: failure.log,
        commits: failure.commits
      }, db);
    }

    const testEventIds: string[] = [];
    for (const testCase of testCases) {
      for (let index = 0; index < testCase.outcomes.length; index++) {
        const run = runs[index];
        const eventId = crypto
          .createHash('sha256')
          .update(`${projectId}:${testCase.testId}:${run.runId}`)
          .digest('hex');
        testEventIds.push(eventId);
        await db.collection('testResults').updateOne(
          { eventId },
          {
            $setOnInsert: {
              eventId,
              projectId,
              runId: run.runId,
              headSha: run.headSha,
              testId: testCase.testId,
              file: 'demo/integration.test.ts',
              outcome: testCase.outcomes[index],
              durationMs: 1200,
              errorMessage: testCase.outcomes[index] === 'fail' ? testCase.errorMessage : null,
              ts: run.completedAt
            }
          },
          { upsert: true }
        );
      }
    }

    const failureCount = await db.collection('failures').countDocuments({
      projectId,
      failureId: { $in: failureDefinitions.map((failure) => failure.failureId) }
    });
    const seededFailures = await db.collection('failures').find(
      { projectId, failureId: { $in: failureDefinitions.map((failure) => failure.failureId) } },
      { projection: { signature: 1 } }
    ).toArray();
    const signatureCount = new Set(seededFailures.map((failure) => failure.signature)).size;
    const testResultCount = await db.collection('testResults').countDocuments({
      eventId: { $in: testEventIds }
    });
    return res.json({
      success: true,
      message: 'Demo runs, analyzed failures, signatures, and test executions are ready.',
      counts: {
        runs: runs.length,
        failures: failureCount,
        signatures: signatureCount,
        testResults: testResultCount
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SEED_ERROR', message: err.message } });
  }
});

// Simulate a live failing run scenario through real pipeline
router.post('/simulate/:scenario', async (req: Request, res: Response) => {
  try {
    const { scenario } = req.params;
    const projectId = 'demo-shop';

    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DB_OFFLINE',
          message: 'Failure simulation requires MongoDB. Check the API logs for the connection failure.'
        }
      });
    }

    const fixtureMap: Record<string, { file: string; job: string; commit: any }> = {
      dependency: {
        file: 'npm_lock_out_of_sync.log',
        job: 'npm ci',
        commit: {
          sha: 'd1e2f3a',
          author: 'Sarah Chen',
          message: 'bump axios to v1.7.2',
          files: ['package.json']
        }
      },
      typescript: {
        file: 'ts_compile_error.log',
        job: 'build (tsc)',
        commit: {
          sha: 'f7a8b9c',
          author: 'Alex Rivera',
          message: 'update UserSession schema',
          files: ['src/services/authService.ts']
        }
      },
      missing_secret: {
        file: 'env_var_missing.log',
        job: 'test:e2e',
        commit: {
          sha: '3c4d5e6',
          author: 'Dev Bot',
          message: 'integrate Stripe billing API',
          files: ['src/config/stripe.js', '.github/workflows/ci.yml']
        }
      },
      flaky_flip: {
        file: 'test_timeout.log',
        job: 'test:integration',
        commit: {
          sha: '8a9b0c1',
          author: 'Maya Lin',
          message: 'add queue worker test',
          files: ['src/integration/worker.test.ts']
        }
      },
      network_reset: {
        file: 'network_reset.log',
        job: 'fetch-schema',
        commit: {
          sha: '2b3c4d5',
          author: 'Dev Bot',
          message: 'update API schema validation step',
          files: ['.github/workflows/ci.yml']
        }
      }
    };

    const config = fixtureMap[scenario] || fixtureMap.dependency;
    const rawLog = loadFixture(config.file);
    const failureId = `sim_${crypto.randomBytes(4).toString('hex')}`;
    const runId = `gh:sim:${Date.now()}`;

    const result = await orchestrateAnalysis({
      failureId,
      projectId,
      runId,
      jobName: config.job,
      rawLog,
      commits: [config.commit]
    });

    return res.json({
      success: true,
      scenario,
      failureId,
      diagnosis: result.diagnosis,
      agentSteps: result.agentSteps,
      isRegression: result.isRegression
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SIMULATE_ERROR', message: err.message } });
  }
});

// Reset demo
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DB_OFFLINE',
          message: 'Demo data cannot be reset without MongoDB. Check the API logs for the connection failure.'
        }
      });
    }

    const db = getDb();
    await db.collection('failures').deleteMany({ projectId: 'demo-shop' });
    await db.collection('signatures').deleteMany({ projectId: 'demo-shop' });
    await db.collection('agentSteps').deleteMany({});
    await db.collection('diagnoses').deleteMany({});
    return res.json({ success: true, message: 'Demo state reset successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'RESET_ERROR', message: err.message } });
  }
});

export default router;
