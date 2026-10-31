import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import webhooksRouter from '../../src/routes/webhooks.js';
import ingestRouter from '../../src/routes/ingest.js';

describe('CI Event Ingestion & Webhooks', () => {
  let server: http.Server;
  let baseUrl: string;
  const testSecret = 'super_secret_webhook_token_999';

  before(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = testSecret;

    const app = express();
    app.use(
      express.json({
        verify: (req: any, _res: any, buf: Buffer) => {
          req.rawBody = buf.toString('utf8');
        }
      })
    );
    app.use('/api/webhooks', webhooksRouter);
    app.use('/api/ingest', ingestRouter);

    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function signPayload(body: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(Buffer.from(body));
    return `sha256=${hmac.digest('hex')}`;
  }

  test('rejects request with missing X-GitHub-Event header (HTTP 400)', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'completed' })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'MISSING_EVENT_HEADER');
  });

  test('handles GitHub ping event successfully (HTTP 200)', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'ping'
      },
      body: JSON.stringify({ zen: 'Keep it logically awesome.' })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.message.includes('Pong'));
  });

  test('rejects request missing X-Hub-Signature-256 when secret is configured (HTTP 401)', async () => {
    const payload = JSON.stringify({
      action: 'completed',
      workflow_run: { id: 1001, run_attempt: 1, conclusion: 'failure', head_sha: 'sha1', name: 'CI' },
      repository: { id: 501, name: 'repo-test', owner: { login: 'octocat' } }
    });

    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'workflow_run'
      },
      body: payload
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'MISSING_SIGNATURE');
  });

  test('rejects request with invalid HMAC signature (HTTP 401)', async () => {
    const payload = JSON.stringify({
      action: 'completed',
      workflow_run: { id: 1002, run_attempt: 1, conclusion: 'failure', head_sha: 'sha2', name: 'CI' },
      repository: { id: 502, name: 'repo-test', owner: { login: 'octocat' } }
    });

    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'workflow_run',
        'X-Hub-Signature-256': 'sha256=invalid_hex_digest_000000000000000000000000000000000000000000000000'
      },
      body: payload
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_SIGNATURE');
  });

  test('accepts valid GitHub workflow_run completed event with correct HMAC signature (HTTP 202)', async () => {
    const payloadObj = {
      action: 'completed',
      workflow_run: { id: 1003, run_attempt: 1, conclusion: 'failure', head_sha: 'sha3', name: 'CI' },
      repository: { id: 503, name: 'repo-test', owner: { login: 'octocat' } }
    };
    const payload = JSON.stringify(payloadObj);
    const sig = signPayload(payload, testSecret);

    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'workflow_run',
        'X-Hub-Signature-256': sig
      },
      body: payload
    });

    assert.strictEqual(res.status, 202);
    const data = await res.json();
    assert.strictEqual(data.accepted, true);
    assert.ok(data.eventId);
  });

  test('deduplicates duplicate deliveries of the same workflow_run event', async () => {
    const payloadObj = {
      action: 'completed',
      workflow_run: { id: 1004, run_attempt: 1, conclusion: 'failure', head_sha: 'sha4', name: 'CI' },
      repository: { id: 504, name: 'repo-test', owner: { login: 'octocat' } }
    };
    const payload = JSON.stringify(payloadObj);
    const sig = signPayload(payload, testSecret);

    // 1st delivery
    const res1 = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'workflow_run',
        'X-Hub-Signature-256': sig
      },
      body: payload
    });
    assert.strictEqual(res1.status, 202);

    // 2nd delivery (identical payload)
    const res2 = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'workflow_run',
        'X-Hub-Signature-256': sig
      },
      body: payload
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.duplicate, true);
  });

  test('rejects invalid payload missing workflow_run or repository (HTTP 400)', async () => {
    const payload = JSON.stringify({ action: 'completed' });
    const sig = signPayload(payload, testSecret);

    const res = await fetch(`${baseUrl}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'workflow_run',
        'X-Hub-Signature-256': sig
      },
      body: payload
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_PAYLOAD');
  });

  test('valid generic CI payload ingestion (HTTP 200)', async () => {
    const payload = {
      run: {
        externalId: 'ext-run-123',
        branch: 'main',
        sha: 'a1b2c3d4e5f6',
        workflow: 'test-suite',
        status: 'failure'
      },
      log: 'npm ERR! Missing: lodash from lock file\nProcess completed with exit code 1.'
    };

    const res = await fetch(`${baseUrl}/api/ingest/test-proj`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.runId, 'generic:test-proj:ext-run-123');
  });

  test('rejects malformed generic CI payload (HTTP 400)', async () => {
    const invalidPayload = {
      run: {
        externalId: '', // Invalid empty externalId
        branch: 'main'
      }
    };

    const res = await fetch(`${baseUrl}/api/ingest/test-proj`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'VALIDATION_ERROR');
  });
});
