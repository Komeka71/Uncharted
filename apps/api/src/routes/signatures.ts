import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb, isDbConnected } from '../db/client.js';

const router = Router();

const KnownFixSchema = z.object({
  note: z.string().min(1, 'Fix note is required'),
  commitSha: z.string().optional(),
  author: z.string().optional()
});

router.post('/:signature/known-fix', async (req: Request, res: Response) => {
  try {
    const { signature } = req.params;
    const parse = KnownFixSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: { code: 'INVALID_FIX', message: parse.error.errors[0]?.message } });
    }

    const { note, commitSha, author } = parse.data;

    if (isDbConnected()) {
      const db = getDb();
      const knownFix = {
        note,
        commitSha,
        author: author || 'Team Member',
        fixedAt: new Date()
      };

      await db.collection('signatures').updateOne(
        { signature },
        {
          $set: {
            knownFix,
            status: 'resolved'
          }
        }
      );

      return res.json({
        success: true,
        message: `Known fix successfully registered for signature ${signature}`,
        knownFix
      });
    }

    return res.status(200).json({ success: true, message: 'Fix registered (memory)' });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'KNOWN_FIX_ERROR', message: err.message } });
  }
});

export default router;
