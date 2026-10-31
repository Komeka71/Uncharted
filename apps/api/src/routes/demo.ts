
import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { getDb, isDbConnected } from '../db/client.js';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';

const router = Router();

const DEMO_PROJECT_ID = 'demo-shop';

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

  'env_var_missing.log':
    'Error: Missing required environment variable STRIPE_SECRET_KEY',

  'test_timeout.log':
    'FAIL tests/worker.test.ts - Expected the worker to finish before the timeout',

  'network_reset.log':
    'Error: socket hang up (ECONNRESET)'
};

function loadFixture(filename: string): string {
  const fixture = DEMO_LOGS[filename];

  if (!fixture) {
    throw new Error(`Unknown demo log fixture: ${filename}`);
  }

  return fixture;
}

function databaseUnavailable(res: Response, action: string) {
  return res.status(503).json({
    error: {
      code: 'DB_OFFLINE',
      message: `${action} requires MongoDB. Check the API logs for the connection failure.`
    }
  });
}

// Seed complete demo state
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    if (!isDbConnected()) {
      return databaseUnavailable(res, 'Demo seeding');
    }

    const db = getDb();
    const now = Date.now();

    const shas = [
      'demo-sha-a',
      'demo-sha-a',
      'demo-sha-b',
      'demo-sha-c',
      'demo-sha-c',
      'demo-sha-d',
      'demo-sha-e',
      'demo-sha-f'
    ];

    // Create or update the Origin demo project.
    await db.collection('projects').updateOne(
      { projectId: DEMO_PROJECT_ID },
      {
        $set: {
          projectId: DEMO_PROJECT_ID,
          name: 'Origin Demo Shop',
          repo: {
            owner: 'origin-ci',
            name: 'origin-demo-shop',
            provider: 'github'
          },
          webhookSecret: 'origin_demo_secret_2026',
          ingestToken: 'clp_demo_token_xyz'
        },
        $setOnInsert: {
          createdAt: new Date(now - 14 * 86400000)
        }
      },
      { upsert: true }
    );

    // Historical CI runs.
    const runs = shas.map((headSha, index) => {
      const startedAt = new Date(
        now - (shas.length - index) * 3600000
      );

      return {
        projectId: DEMO_PROJECT_ID,
        runId: `demo-run-${index + 1}`,
        workflow:
          index === 0
            ? 'Dependency Validation'
            : index === 1
              ? 'Build and Test'
              : 'Integration Tests',
        branch: 'main',
        headSha,
        event: 'push',
        actor: 'origin-demo',
        status: 'completed',
        conclusion: index < 7 ? 'failure' : 'success',
        startedAt,
        completedAt: new Date(startedAt.getTime() + 180000),
        durationMs: 180000,
        url: `https://github.com/origin-ci/origin-demo-shop/actions/runs/${index + 1}`,
        prNumber: null
      };
    });

    for (const run of runs) {
      await db.collection('runs').updateOne(
        {
          projectId: DEMO_PROJECT_ID,
          runId: run.runId
        },
        { $setOnInsert: run },
        { upsert: true }
      );
    }

    // Failures are processed through the actual analysis pipeline.
    const failureDefinitions = [
      {
        failureId: 'demo-failure-npm-1',
        runId: 'demo-run-1',
        jobName: 'npm ci',
        log: loadFixture('npm_lock_out_of_sync.log'),
        commits: [
          {
            sha: shas[0],
            author: 'Sarah Chen',
            message: 'update package dependencies',
            files: ['package.json', 'package-lock.json']
          }
        ]
      },
      {
        failureId: 'demo-failure-npm-2',
        runId: 'demo-run-2',
        jobName: 'npm ci',
        log: loadFixture('npm_lock_out_of_sync.log'),
        commits: [
          {
            sha: shas[1],
            author: 'Sarah Chen',
            message: 'update package dependencies',
            files: ['package.json', 'package-lock.json']
          }
        ]
      },
      {
        failureId: 'demo-failure-ts-1',
        runId: 'demo-run-3',
        jobName: 'build (tsc)',
        log: loadFixture('ts_compile_error.log'),
        commits: [
          {
            sha: shas[2],
            author: 'Alex Rivera',
            message: 'refactor auth session payload and user roles',
            files: [
              'src/services/authService.ts',
              'src/types/auth.ts'
            ]
          },
          {
            sha: 'e5f6a1b',
            author: 'Maya Lin',
            message: 'update readme documentation',
            files: ['README.md']
          }
        ]
      }
    ];

    for (const failure of failureDefinitions) {
      const existing = await db.collection('failures').findOne({
        projectId: DEMO_PROJECT_ID,
        failureId: failure.failureId
      });

      if (existing) {
        await db.collection('failures').updateOne(
          {
            projectId: DEMO_PROJECT_ID,
            failureId: failure.failureId
          },
          {
            $set: {
              runId: failure.runId,
              jobName: failure.jobName
            }
          }
        );

        continue;
      }

      await orchestrateAnalysis(
        {
          failureId: failure.failureId,
          projectId: DEMO_PROJECT_ID,
          runId: failure.runId,
          jobName: failure.jobName,
          rawLog: failure.log,
          commits: failure.commits
        },
        db
      );
    }

    // Historical test execution data for flaky-test analysis.
    const testCases = [
      {
        testId: 'Checkout › retries transient network requests',
        outcomes: [
          'pass', 'fail', 'pass', 'fail',
          'pass', 'pass', 'fail', 'pass'
        ],
        errorMessage: 'ECONNRESET while calling the checkout service'
      },
      {
        testId: 'Authentication › rejects expired refresh tokens',
        outcomes: [
          'fail', 'fail', 'fail', 'fail',
          'fail', 'fail', 'fail', 'fail'
        ],
        errorMessage: 'Expected expired token to be rejected'
      },
      {
        testId: 'Orders › retries after a temporary database timeout',
        outcomes: [
          'pass', 'pass', 'fail', 'pass',
          'pass', 'pass', 'pass', 'pass'
        ],
        errorMessage: 'Timed out waiting for the database response'
      },
      {
        testId: 'Catalog › returns products in the requested order',
        outcomes: [
          'pass', 'pass', 'pass', 'pass',
          'pass', 'pass', 'pass', 'pass'
        ],
        errorMessage: null
      }
    ];

    const testEventIds: string[] = [];

    for (const testCase of testCases) {
      for (let index = 0; index < testCase.outcomes.length; index++) {
        const run = runs[index];

        const eventId = crypto
          .createHash('sha256')
          .update(
            `${DEMO_PROJECT_ID}:${testCase.testId}:${run.runId}`
          )
          .digest('hex');

        testEventIds.push(eventId);

        await db.collection('testResults').updateOne(
          { eventId },
          {
            $setOnInsert: {
              eventId,
              projectId: DEMO_PROJECT_ID,
              runId: run.runId,
              headSha: run.headSha,
              testId: testCase.testId,
              file: 'demo/integration.test.ts',
              outcome: testCase.outcomes[index],
              durationMs: 1200,
              errorMessage:
                testCase.outcomes[index] === 'fail'
                  ? testCase.errorMessage
                  : null,
              ts: run.completedAt
            }
          },
          { upsert: true }
        );
      }
    }

    // Calculate seeded data counts.
    const failureCount = await db.collection('failures').countDocuments({
      projectId: DEMO_PROJECT_ID,
      failureId: {
        $in: failureDefinitions.map((failure) => failure.failureId)
      }
    });

    const seededFailures = await db.collection('failures')
      .find(
        {
          projectId: DEMO_PROJECT_ID,
          failureId: {
            $in: failureDefinitions.map((failure) => failure.failureId)
          }
        },
        { projection: { signature: 1 } }
      )
      .toArray();

    const signatures = seededFailures
      .map((failure) => failure.signature)
      .filter(Boolean);

    const signatureCount = new Set(signatures).size;

    const testResultCount = await db.collection('testResults')
      .countDocuments({
        projectId: DEMO_PROJECT_ID,
        eventId: { $in: testEventIds }
      });

    return res.json({
      success: true,
      message:
        'Origin demo runs, analyzed failures, signatures, and test executions are ready.',
      counts: {
        runs: runs.length,
        failures: failureCount,
        signatures: signatureCount,
        testResults: testResultCount
      }
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown seeding error';

    return res.status(500).json({
      error: {
        code: 'SEED_ERROR',
        message
      }
    });
  }
});

// Simulate a live failing run through the real analysis pipeline.
router.post('/simulate/:scenario', async (req: Request, res: Response) => {
  try {
    const { scenario } = req.params;

    if (!isDbConnected()) {
      return databaseUnavailable(res, 'Failure simulation');
    }

    const fixtureMap: Record<
      string,
      {
        file: string;
        job: string;
        commit: { sha: string; author: string; message: string; files: string[] };
      }
    > = {
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
          files: [
            'src/config/stripe.js',
            '.github/workflows/ci.yml'
          ]
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

    const config = fixtureMap[scenario];

    if (!config) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SCENARIO',
          message: `Unknown demo scenario: ${scenario}`,
          availableScenarios: Object.keys(fixtureMap)
        }
      });
    }

    const db = getDb();
    const rawLog = loadFixture(config.file);
    const failureId = `sim_${crypto.randomBytes(4).toString('hex')}`;
    const runId = `gh:sim:${Date.now()}`;

    const result = await orchestrateAnalysis(
      {
        failureId,
        projectId: DEMO_PROJECT_ID,
        runId,
        jobName: config.job,
        rawLog,
        commits: [config.commit]
      },
      db
    );

    return res.json({
      success: true,
      scenario,
      failureId,
      diagnosis: result.diagnosis,
      agentSteps: result.agentSteps,
      isRegression: result.isRegression
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown simulation error';

    return res.status(500).json({
      error: {
        code: 'SIMULATE_ERROR',
        message
      }
    });
  }
});

// Reset only Origin demo data.
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    if (!isDbConnected()) {
      return databaseUnavailable(res, 'Demo reset');
    }

    const db = getDb();
    const projectFilter = { projectId: DEMO_PROJECT_ID };

    await Promise.all([
      db.collection('failures').deleteMany(projectFilter),
      db.collection('signatures').deleteMany(projectFilter),
      db.collection('runs').deleteMany(projectFilter),
      db.collection('testResults').deleteMany(projectFilter),
      db.collection('agentSteps').deleteMany(projectFilter),
      db.collection('diagnoses').deleteMany(projectFilter)
    ]);

    return res.json({
      success: true,
      message: 'Origin demo state reset successfully'
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown reset error';

    return res.status(500).json({
      error: {
        code: 'RESET_ERROR',
        message
      }
    });
  }
});

export default router;
