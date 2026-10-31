import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.use(createRateLimiter({ windowMs: 60000, max: 20, message: 'Too many analysis requests, please slow down.' }));

const AnalyzeBodySchema = z.object({
  log: z.string().min(1, 'Log content cannot be empty').max(5 * 1024 * 1024, 'Log exceeds 5MB limit'),
  commits: z.array(
    z.object({
      sha: z.string(),
      author: z.string(),
      message: z.string(),
      files: z.array(z.string())
    })
  ).optional()
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parseResult = AnalyzeBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.errors[0]?.message || 'Invalid log payload'
        }
      });
    }

    const { log, commits } = parseResult.data;

    const result = await orchestrateAnalysis({
      rawLog: log,
      commits
    });

    return res.json({
      success: true,
      diagnosis: result.diagnosis,
      agentSteps: result.agentSteps,
      isRegression: result.isRegression
    });
  } catch (err: any) {
    console.error('Error in /api/analyze:', err);
    return res.status(500).json({
      error: {
        code: 'ANALYSIS_FAILED',
        message: err.message || 'Failed to analyze log'
      }
    });
  }
});

export default router;
