import { Router, Request, Response } from 'express';
import { getDb, isDbConnected } from '../db/client.js';
import { aggregateFlakyTests } from '../aggregations/index.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const projectId = (req.query.projectId as string) || 'demo-shop';

    if (!isDbConnected()) {
      return res.status(503).json({
        error: {
          code: 'DB_OFFLINE',
          message: 'Flaky test results require MongoDB. Check the API logs for the connection failure.'
        }
      });
    }

    const db = getDb();
    const tests = await aggregateFlakyTests(db, projectId, 50);
    return res.json({ tests });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'FLAKY_ERROR', message: err.message } });
  }
});

export default router;
