import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { addSSEClient } from '../services/sse.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const clientId = `client_${crypto.randomBytes(4).toString('hex')}`;
  addSSEClient(clientId, res);
});

export default router;
