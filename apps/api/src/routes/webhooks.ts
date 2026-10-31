import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { getDb, isDbConnected } from '../db/client.js';
import { verifyGitHubWebhookSignature } from '../services/github.js';
import { enqueueJob } from '../queue/jobQueue.js';

const router = Router();
const offlineEventDedupeCache = new Set<string>();

router.post('/github', async (req: Request, res: Response) => {
  const eventType = req.headers['x-github-event'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (!eventType) {
    return res.status(400).json({ error: { code: 'MISSING_EVENT_HEADER', message: 'Missing X-GitHub-Event header' } });
  }

  // Handle ping event
  if (eventType === 'ping') {
    return res.status(200).json({ message: 'Pong! Webhook successfully registered.' });
  }

  if (eventType !== 'workflow_run') {
    return res.status(200).json({ message: `Ignored event: ${eventType}` });
  }

  const payload = req.body;
  const action = payload.action;

  // We process runs when completed
  if (action !== 'completed') {
    return res.status(200).json({ message: `Workflow run action is ${action}, not completed. Skipping.` });
  }

  const run = payload.workflow_run;
  const repository = payload.repository;

  if (!run || !repository) {
    return res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message: 'Missing workflow_run or repository in payload' } });
  }

  const repoOwner = repository.owner?.login || repository.owner?.name;
  const repoName = repository.name;
  const runId = run.id;
  const runAttempt = run.run_attempt || 1;

  if (!repoOwner || !repoName || !runId) {
    return res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message: 'Missing repoOwner, repoName, or runId in payload' } });
  }

  // Idempotency: sha256(source + repoId + runId + runAttempt + eventType + action)
  const eventId = crypto
    .createHash('sha256')
    .update(`github:${repository.id}:${runId}:${runAttempt}:${eventType}:${action}`)
    .digest('hex');

  const globalSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (isDbConnected()) {
    const db = getDb();

    // Check project and verify secret if set
    const project = await db.collection('projects').findOne({
      'repo.owner': repoOwner,
      'repo.name': repoName
    });

    const effectiveSecret = project?.webhookSecret || globalSecret;

    if (effectiveSecret) {
      if (!signature) {
        return res.status(401).json({
          error: { code: 'MISSING_SIGNATURE', message: 'X-Hub-Signature-256 header is required when webhook secret is configured' }
        });
      }
      const isValid = verifyGitHubWebhookSignature(rawBody, signature, effectiveSecret);
      if (!isValid) {
        return res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' } });
      }
    }

    // Check idempotency in ingestEvents
    try {
      await db.collection('ingestEvents').insertOne({
        eventId,
        projectId: project?.projectId || 'default',
        source: 'github',
        type: eventType,
        status: 'received',
        receivedAt: new Date()
      });
    } catch (err: any) {
      if (err.code === 11000) {
        // Duplicate event! Idempotent return
        return res.status(200).json({ duplicate: true, message: 'Event already received and processed' });
      }
    }
  } else {
    // Offline mode: verify global secret if present
    if (globalSecret) {
      if (!signature) {
        return res.status(401).json({
          error: { code: 'MISSING_SIGNATURE', message: 'X-Hub-Signature-256 header is required when webhook secret is configured' }
        });
      }
      const isValid = verifyGitHubWebhookSignature(rawBody, signature, globalSecret);
      if (!isValid) {
        return res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' } });
      }
    }

    // In-memory deduplication fallback
    if (offlineEventDedupeCache.has(eventId)) {
      return res.status(200).json({ duplicate: true, message: 'Event already received and processed (offline cache)' });
    }
    offlineEventDedupeCache.add(eventId);
    if (offlineEventDedupeCache.size > 1000) {
      const first = offlineEventDedupeCache.values().next().value;
      if (first) offlineEventDedupeCache.delete(first);
    }
  }

  // Enqueue async processing job
  await enqueueJob('process_workflow_run', {
    eventId,
    repoOwner,
    repoName,
    runId,
    runAttempt,
    conclusion: run.conclusion,
    headSha: run.head_sha,
    headBranch: run.head_branch,
    workflowName: run.name,
    runUrl: run.html_url
  });

  // Return 202 immediately
  return res.status(202).json({
    accepted: true,
    eventId,
    status: 'enqueued',
    message: 'Workflow run event received and enqueued for deterministic analysis'
  });
});

export default router;
