import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb, isDbConnected } from '../db/client.js';
import { fetchGitHubRun, fetchGitHubRunJobs, fetchGitHubJobLog } from '../services/github.js';
import { orchestrateAnalysis } from '../services/agentOrchestrator.js';
import { enqueueJob } from '../queue/jobQueue.js';
import { env } from '../config/env.js';

const router = Router();

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  repo: z.object({
    owner: z.string().min(1),
    name: z.string().min(1),
    provider: z.enum(['github']).default('github')
  })
});

// Create project
router.post('/', async (req: Request, res: Response) => {
  try {
    const parse = CreateProjectSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: { code: 'INVALID_PROJECT', message: parse.error.errors[0]?.message } });
    }

    const { name, repo } = parse.data;
    const projectId = `proj_${crypto.randomBytes(4).toString('hex')}`;
    const webhookSecret = crypto.randomBytes(20).toString('hex');
    const ingestToken = `clp_${crypto.randomBytes(24).toString('hex')}`;

    const projectDoc = {
      _id: projectId,
      projectId,
      name,
      repo,
      webhookSecret,
      ingestToken,
      createdAt: new Date()
    };

    if (isDbConnected()) {
      const db = getDb();
      await db.collection('projects').insertOne(projectDoc as any);
    }

    return res.status(201).json({
      success: true,
      project: {
        projectId,
        name,
        repo,
        webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/github`,
        webhookSecret,
        ingestToken,
        createdAt: projectDoc.createdAt
      }
    });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: { code: 'PROJECT_EXISTS', message: 'Repository already connected to a project' } });
    }
    return res.status(500).json({ error: { code: 'PROJECT_CREATE_ERROR', message: err.message } });
  }
});

// List projects
router.get('/', async (_req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const db = getDb();
      const projects = await db.collection('projects').find({}).sort({ createdAt: -1 }).toArray();
      return res.json({
        projects: projects.map((p: any) => ({
          projectId: p.projectId || p._id,
          name: p.name,
          repo: p.repo,
          createdAt: p.createdAt
        }))
      });
    }

    // Default demo project if offline
    return res.json({
      projects: [
        {
          projectId: 'demo-shop',
          name: 'Origin Demo Shop',
          repo: { owner: 'origin-ci', name: 'origin-demo-shop', provider: 'github' },
          createdAt: new Date().toISOString()
        }
      ]
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'PROJECT_LIST_ERROR', message: err.message } });
  }
});

// Get project detail and setup snippets
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let project: any = null;

    if (isDbConnected()) {
      const db = getDb();
      project = await db.collection('projects').findOne({ $or: [{ projectId: id }, { _id: id as any }] });
    }

    if (!project) {
      project = {
        projectId: id,
        name: 'Origin Demo Shop',
        repo: { owner: 'origin-ci', name: 'origin-demo-shop', provider: 'github' },
        webhookSecret: 'origin_demo_secret_2026',
        ingestToken: 'clp_demo_token_xyz',
        createdAt: new Date()
      };
    }

    const host = req.get('host') || 'localhost:4000';
    const proto = req.protocol || 'http';
    const webhookUrl = `${proto}://${host}/api/webhooks/github`;

    const githubActionsSnippet = `name: Origin Ingest
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test -- --ci --testResultsProcessor=jest-junit
      
      - name: Upload Test Results to Origin
        if: always()
        run: |
          curl -X POST "${proto}://${host}/api/ingest/${project.projectId}" \\
            -H "Authorization: Bearer \${{ secrets.ORIGIN_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d @- << 'EOF'
          {
            "run": {
              "externalId": "\${{ github.run_id }}",
              "branch": "\${{ github.ref_name }}",
              "sha": "\${{ github.sha }}",
              "workflow": "\${{ github.workflow }}",
              "status": "\${{ job.status }}"
            }
          }
          EOF`;

    return res.json({
      project: {
        ...project,
        webhookUrl,
        githubActionsSnippet
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'PROJECT_ERROR', message: err.message } });
  }
});

// Manual Sync
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let project: any = null;

    if (isDbConnected()) {
      const db = getDb();
      project = await db.collection('projects').findOne({
        $or: [{ projectId: id }, { _id: id as any }]
      });
      if (!project) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROJECT_NOT_FOUND', message: `Project ${id} not found` },
          message: `Project ${id} not found`
        });
      }
    } else {
      if (id === 'demo-shop') {
        project = {
          projectId: 'demo-shop',
          name: 'Origin Demo Shop',
          repo: { owner: 'origin-ci', name: 'origin-demo-shop', provider: 'github' }
        };
      } else {
        return res.status(404).json({
          success: false,
          error: { code: 'PROJECT_NOT_FOUND', message: `Project ${id} not found` },
          message: `Project ${id} not found`
        });
      }
    }

    const token = project.githubToken || env.GITHUB_TOKEN;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_GITHUB_TOKEN', message: 'GITHUB_TOKEN is not configured for manual sync' },
        message: 'GITHUB_TOKEN is not configured'
      });
    }

    const jobId = await enqueueJob('sync_project_runs', {
      projectId: project.projectId || id,
      limit: 20
    });

    return res.json({
      success: true,
      queued: true,
      jobId,
      message: `Sync queued for project ${project.name || id}. Fetching recent completed workflow runs.`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SYNC_ERROR', message: err.message },
      message: err.message
    });
  }
});

export default router;
