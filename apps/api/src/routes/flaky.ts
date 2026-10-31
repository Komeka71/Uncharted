import { Router, Request, Response } from 'express';
import { getDb, isDbConnected } from '../db/client.js';
import { aggregateFlakyTests } from '../aggregations/index.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const projectId = (req.query.projectId as string) || 'demo-shop';

    if (isDbConnected()) {
      const db = getDb();
      const tests = await aggregateFlakyTests(db, projectId, 50);
      // Honest response: return real database contents (even if empty)
      return res.json({ tests, isDemoData: false });
    }

    // High fidelity fallback for demo mode ONLY when DB is disconnected
    return res.json({
      isDemoData: true,
      tests: [
        {
          testId: 'Billing Controller › calculates discounted subscription invoice',
          totalRuns: 28,
          fails: 7,
          passes: 21,
          sameShaFlips: 2,
          flips: 6,
          verdict: 'flaky',
          historySparkline: ['pass', 'pass', 'fail', 'pass', 'fail', 'pass', 'pass', 'pass', 'fail', 'pass'],
          lastErrorMessage: 'expected 90 to equal 100',
          recommendation: 'High flakiness detected (2 same-commit flips). Quarantine candidate to prevent blocking CI.'
        },
        {
          testId: 'Authentication Service › verifies expired JWT refresh token',
          totalRuns: 18,
          fails: 18,
          passes: 0,
          sameShaFlips: 0,
          flips: 0,
          verdict: 'broken',
          historySparkline: ['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail'],
          lastErrorMessage: 'AssertionError: assert True is False',
          recommendation: 'Consistent failure across all executions. Genuine regression or breaking code defect.'
        },
        {
          testId: 'Payment Gateway Integration › processes Stripe 3D-Secure webhooks',
          totalRuns: 12,
          fails: 3,
          passes: 9,
          sameShaFlips: 1,
          flips: 3,
          verdict: 'flaky',
          historySparkline: ['pass', 'pass', 'fail', 'pass', 'pass', 'fail', 'pass'],
          lastErrorMessage: 'Exceeded timeout of 5000 ms for a test.',
          recommendation: 'Timeout flakiness detected. Review network latency and increase timeout limit.'
        },
        {
          testId: 'User Profile › updates notification preferences in database',
          totalRuns: 30,
          fails: 0,
          passes: 30,
          sameShaFlips: 0,
          flips: 0,
          verdict: 'stable',
          historySparkline: ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'],
          recommendation: 'Test is healthy and passing consistently.'
        }
      ]
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'FLAKY_ERROR', message: err.message } });
  }
});

export default router;
