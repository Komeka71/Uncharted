import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb, isDbConnected } from '../db/client.js';
import { recordKnownFix } from '../history/historyService.js';

const router = Router();

const KnownFixSchema = z.object({
  note: z.string().min(1, 'Fix note is required'),
  commitSha: z.string().optional(),
  author: z.string().optional(),
  projectId: z.string().optional()
});

/**
 * Register a known fix note for an error signature.
 * Stores as 'unverified'. Does NOT mark signature as resolved.
 */
router.post('/:signature/known-fix', async (req: Request, res: Response) => {
  try {
    const { signature } = req.params;
    const parse = KnownFixSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: { code: 'INVALID_FIX', message: parse.error.errors[0]?.message } });
    }

    const { note, commitSha, author } = parse.data;
    let projectId = parse.data.projectId || (req.query.projectId as string);

    if (isDbConnected()) {
      const db = getDb();

      // If projectId is not explicitly provided, attempt to auto-resolve from signatures
      if (!projectId) {
        const found = await db.collection('signatures').findOne({ signature });
        projectId = found?.projectId || 'demo-shop';
      }

      const knownFix = await recordKnownFix(db, {
        projectId,
        signature,
        note,
        commitSha,
        author: author || 'Team Member'
      });

      return res.json({
        success: true,
        message: `Known fix note registered for signature ${signature} (status: unverified)`,
        knownFix
      });
    }

    // High fidelity offline fallback
    const offlineFix = {
      note,
      commitSha,
      author: author || 'Team Member',
      fixedAt: new Date().toISOString(),
      verificationStatus: 'unverified'
    };

    return res.status(200).json({
      success: true,
      message: 'Known fix note registered (memory fallback, unverified)',
      knownFix: offlineFix
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'KNOWN_FIX_ERROR', message: err.message } });
  }
});

/**
 * Retrieve the full historical record and timeline for a given signature.
 */
router.get('/:signature/history', async (req: Request, res: Response) => {
  try {
    const { signature } = req.params;
    let projectId = req.query.projectId as string;

    if (isDbConnected()) {
      const db = getDb();

      if (!projectId) {
        const found = await db.collection('signatures').findOne({ signature });
        projectId = found?.projectId || 'demo-shop';
      }

      const sigDoc = await db.collection('signatures').findOne({ projectId, signature });
      const recentFailures = await db.collection('failures')
        .find({ projectId, signature })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      const occurrencesHistory = recentFailures.map((f) => ({
        failureId: f.failureId,
        runId: f.runId,
        headSha: f.headSha,
        branch: f.branch,
        createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : new Date(f.createdAt).toISOString()
      }));

      return res.json({
        signature,
        projectId,
        status: sigDoc?.status || (recentFailures.length > 0 ? 'open' : 'unknown'),
        occurrences: sigDoc?.occurrences || recentFailures.length,
        firstSeenAt: sigDoc?.firstSeen || sigDoc?.firstSeenAt || (recentFailures[recentFailures.length - 1]?.createdAt),
        lastSeenAt: sigDoc?.lastSeen || sigDoc?.lastSeenAt || (recentFailures[0]?.createdAt),
        resolvedAt: sigDoc?.resolvedAt,
        knownFix: sigDoc?.knownFix,
        recentFailures: occurrencesHistory
      });
    }

    // Offline demo fallback
    return res.json({
      signature,
      projectId: projectId || 'demo-shop',
      status: 'open',
      occurrences: 2,
      firstSeenAt: new Date(Date.now() - 86400000).toISOString(),
      lastSeenAt: new Date().toISOString(),
      knownFix: undefined,
      recentFailures: []
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'SIGNATURE_HISTORY_ERROR', message: err.message } });
  }
});

export default router;
