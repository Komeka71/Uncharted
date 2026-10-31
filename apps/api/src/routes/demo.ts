import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, isDbConnected } from '../db/client.js';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load fixture
function loadFixture(filename: string): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'packages/core/fixtures', filename),
    path.resolve(process.cwd(), '../../packages/core/fixtures', filename),
    path.resolve(__dirname, '../../../../packages/core/fixtures', filename),
    path.resolve(__dirname, '../../../packages/core/fixtures', filename)
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }

  return `##[group]Run test\nError: Failure in ${filename}\n##[error]Process completed with exit code 1.\n##[endgroup]`;
}

// Seed complete demo state
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    const projectId = 'demo-shop';

    if (isDbConnected()) {
      const db = getDb();

      // Ensure demo project exists
      await db.collection('projects').updateOne(
        { projectId },
        {
          $set: {
            projectId,
            name: 'Culprit Demo Shop',
            repo: { owner: 'culprit-ci', name: 'culprit-demo-shop', provider: 'github' },
            webhookSecret: 'culprit_demo_secret_2026',
            ingestToken: 'clp_demo_token_xyz',
            createdAt: new Date(Date.now() - 14 * 86400000)
          }
        },
        { upsert: true }
      );

      // Seed historical signatures (including one resolved that regressed!)
      const sig1 = 'a7b9c1d2e3f4051a'; // npm lock
      const sig2 = 'f4e3d2c1b0a98765'; // ts compile error (regressed!)
      const sig3 = 'c9d8e7f6a5b43210'; // env var missing

      await db.collection('signatures').updateOne(
        { signature: sig1 },
        {
          $set: {
            projectId,
            signature: sig1,
            category: 'dependency',
            ruleId: 'npm-lock-out-of-sync',
            canonicalMessage: 'npm-lock-out-of-sync|npm ci can only install packages|dependency',
            occurrences: 6,
            firstSeenAt: new Date(Date.now() - 10 * 86400000),
            lastSeenAt: new Date(Date.now() - 1800000),
            status: 'open',
            regressionCount: 0,
            knownFix: {
              note: 'Run `npm install` locally to synchronize package-lock.json before committing.',
              commitSha: '9f8e7d6',
              author: 'Sarah Chen',
              fixedAt: new Date(Date.now() - 5 * 86400000)
            }
          }
        },
        { upsert: true }
      );

      // Regression signature: was resolved, now back!
      await db.collection('signatures').updateOne(
        { signature: sig2 },
        {
          $set: {
            projectId,
            signature: sig2,
            category: 'build_compile',
            ruleId: 'ts-compile-error',
            canonicalMessage: "ts-compile-error|src/services/authService.ts:<LINE>:<COL> error TS2339: Property 'role' does not exist|build_compile",
            occurrences: 4,
            firstSeenAt: new Date(Date.now() - 7 * 86400000),
            lastSeenAt: new Date(Date.now() - 3600000),
            status: 'regressed',
            regressionCount: 2,
            knownFix: {
              note: 'Type SessionUser interface was changed; use user.roles array or check nullable properties.',
              commitSha: 'b4a3c2d',
              author: 'Alex Rivera',
              fixedAt: new Date(Date.now() - 3 * 86400000)
            }
          }
        },
        { upsert: true }
      );

      // Run actual orchestrator on 3 sample fixtures so failures & agentSteps are completely populated!
      const tsLog = loadFixture('ts_compile_error.log');
      await orchestrateAnalysis(
        {
          failureId: 'fail_ts_001',
          projectId,
          runId: 'gh:102030:run-412:1',
          jobName: 'typecheck',
          rawLog: tsLog,
          commits: [
            {
              sha: 'b4a3c2d',
              author: 'Alex Rivera',
              message: 'refactor auth session payload and user roles',
              files: ['src/services/authService.ts', 'src/types/auth.ts']
            },
            {
              sha: 'e5f6a1b',
              author: 'Maya Lin',
              message: 'update readme documentation',
              files: ['README.md']
            }
          ]
        },
        db
      );

      const npmLog = loadFixture('npm_lock_out_of_sync.log');
      await orchestrateAnalysis(
        {
          failureId: 'fail_npm_002',
          projectId,
          runId: 'gh:102030:run-413:1',
          jobName: 'install',
          rawLog: npmLog,
          commits: [
            {
              sha: '9f8e7d6',
              author: 'Sarah Chen',
              message: 'add axios dependency to package.json',
              files: ['package.json']
            }
          ]
        },
        db
      );
    }

    return res.json({
      success: true,
      message: 'Demo project seeded successfully with runs, regressions, flaky tests, and pre-built diagnoses'
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
    if (isDbConnected()) {
      const db = getDb();
      await db.collection('failures').deleteMany({ projectId: 'demo-shop' });
      await db.collection('signatures').deleteMany({ projectId: 'demo-shop' });
      await db.collection('agentSteps').deleteMany({});
      await db.collection('diagnoses').deleteMany({});
    }
    return res.json({ success: true, message: 'Demo state reset successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'RESET_ERROR', message: err.message } });
  }
});

export default router;
