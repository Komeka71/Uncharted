import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import analyzeRouter from '../../src/routes/analyze.js';

describe('Real-Log Analysis Check (/api/analyze)', () => {
  let server: http.Server;
  let baseUrl: string;

  const fixturesDir = path.resolve(process.cwd(), 'packages/core/fixtures');
  const realNpmLog = fs.readFileSync(path.join(fixturesDir, 'real_npm_lockfile.log'), 'utf8');
  const realTsLog = fs.readFileSync(path.join(fixturesDir, 'real_ts_error.log'), 'utf8');

  before(async () => {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/analyze', analyzeRouter);

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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test('analyzes real_npm_lockfile.log deterministically', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: realNpmLog })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.success, true);
    assert.ok(data.diagnosis);
    assert.strictEqual(data.diagnosis.ruleId, 'npm-lock-out-of-sync');
    assert.strictEqual(data.diagnosis.category, 'dependency');
    assert.ok(Array.isArray(data.agentSteps));
    assert.ok(data.agentSteps.length > 0);
  });

  test('analyzes real_ts_error.log deterministically', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: realTsLog })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.success, true);
    assert.ok(data.diagnosis);
    assert.strictEqual(data.diagnosis.ruleId, 'ts-compile-error');
    assert.strictEqual(data.diagnosis.category, 'build_compile');
  });

  test('rejects empty log with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: '' })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json() as any;
    assert.strictEqual(data.error.code, 'VALIDATION_ERROR');
  });
});
