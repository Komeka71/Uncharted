import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn, execSync, ChildProcess } from 'node:child_process';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

function deriveThrowawayUri(baseUri: string, testDbName: string): string {
  if (!testDbName.startsWith('origin_test_')) {
    throw new Error('Refusing to use non-test database name');
  }
  return baseUri.replace(/\/[a-zA-Z0-9_\-]+(\?|$)/, `/${testDbName}$1`);
}

describe('B3: End-to-End Throwaway Database Check on Port 4100', () => {
  const baseUri = process.env.MONGODB_URI;
  if (!baseUri) {
    test('Skipped: MONGODB_URI not available in environment', () => {
      console.log('Skipping B3: MONGODB_URI not available');
      assert.ok(true);
    });
    return;
  }

  const testDbName = `origin_test_b3_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const throwawayUri = deriveThrowawayUri(baseUri, testDbName);
  const port = 4100;
  const baseUrl = `http://localhost:${port}`;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer clp_demo_token_xyz'
  };

  let apiProcess: ChildProcess | null = null;
  let mongoClient: MongoClient | null = null;
  let testSignature = '';

  before(async () => {
    // 1. Connect MongoClient to manage lifecycle and clean up
    mongoClient = new MongoClient(throwawayUri);
    await mongoClient.connect();

    // 2. Spawn the API process on port 4100 with throwaway DB
    apiProcess = spawn(
      'npx.cmd',
      ['tsx', 'apps/api/src/server.ts'],
      {
        env: {
          ...process.env,
          PORT: String(port),
          MONGODB_URI: throwawayUri,
          NODE_ENV: 'development'
        },
        stdio: 'pipe',
        shell: true
      }
    );

    // Wait until server is healthy on port 4100
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) {
          const body = await res.json() as any;
          if (body.database === 'connected') {
            ready = true;
            break;
          }
        }
      } catch {}
    }

    if (!ready) {
      throw new Error('API server on port 4100 failed to become ready and connected within 20s');
    }
  });

  after(async () => {
    // Kill child API process tree
    if (apiProcess && apiProcess.pid) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${apiProcess.pid} /T /F`, { stdio: 'ignore' });
        } else {
          apiProcess.kill('SIGTERM');
        }
      } catch {}
      apiProcess = null;
    }

    // Drop throwaway database
    if (mongoClient) {
      try {
        if (testDbName.startsWith('origin_test_')) {
          await mongoClient.db(testDbName).dropDatabase();
        }
      } catch (err: any) {
        console.warn('Failed to drop throwaway database in B3 after:', err.message);
      } finally {
        await mongoClient.close();
      }
    }
  });

  test('1. /health shows a real database connection', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.database, 'connected');
    assert.strictEqual(body.app, 'Origin API');
  });

  test('2. Seed demo and verify stats/flaky/failures endpoints (isDemoData absent)', async () => {
    // Seed demo project
    const seedRes = await fetch(`${baseUrl}/api/demo/seed`, { method: 'POST' });
    assert.strictEqual(seedRes.status, 200);

    // Verify stats overview
    const statsRes = await fetch(`${baseUrl}/api/stats/overview?projectId=demo-shop`);
    assert.strictEqual(statsRes.status, 200);
    const stats = await statsRes.json() as any;
    assert.strictEqual(typeof stats.kpis.totalFailures7d, 'number');
    assert.strictEqual(typeof stats.kpis.recurringRatePct, 'number');
    assert.strictEqual(typeof stats.kpis.flakyTestsCount, 'number');
    assert.strictEqual(typeof stats.kpis.mttrHours, 'number');
    assert.strictEqual(stats.isDemoData, undefined, 'isDemoData must be absent when connected');

    // Verify flaky
    const flakyRes = await fetch(`${baseUrl}/api/flaky?projectId=demo-shop`);
    assert.strictEqual(flakyRes.status, 200);
    const flaky = await flakyRes.json() as any;
    assert.ok(Array.isArray(flaky.tests));
    assert.strictEqual(flaky.isDemoData, undefined, 'isDemoData must be absent when connected');

    // Verify failures
    const failuresRes = await fetch(`${baseUrl}/api/failures`);
    assert.strictEqual(failuresRes.status, 200);
    const failures = await failuresRes.json() as any;
    assert.ok(Array.isArray(failures.failures));
    assert.ok(failures.failures.length > 0);
  });

  const runPrefix = `b3_run_${Date.now()}`;

  test('3. Recurrence: running same failure twice increments occurrences accurately', async () => {
    const errorLog = `
npm error code EUSAGE
npm error \`npm ci\` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: test-pkg@1.0.0 from lock file
`;

    // First run
    const res1 = await fetch(`${baseUrl}/api/ingest/demo-shop`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        run: {
          externalId: `${runPrefix}_recur_1`,
          branch: 'main',
          sha: 'sha-recur-1',
          workflow: 'CI',
          status: 'failure'
        },
        log: errorLog
      })
    });
    assert.strictEqual(res1.status, 200);
    const body1 = await res1.json() as any;
    testSignature = body1.diagnosis.signature;
    assert.ok(testSignature);

    // Check occurrences after run 1
    const hist1 = await (await fetch(`${baseUrl}/api/signatures/${testSignature}/history?projectId=demo-shop`)).json() as any;
    const countAfterRun1 = hist1.occurrences;
    assert.ok(countAfterRun1 >= 1);

    // Second run with identical failure signature on a different run
    const res2 = await fetch(`${baseUrl}/api/ingest/demo-shop`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        run: {
          externalId: `${runPrefix}_recur_2`,
          branch: 'main',
          sha: 'sha-recur-2',
          workflow: 'CI',
          status: 'failure'
        },
        log: errorLog
      })
    });
    assert.strictEqual(res2.status, 200);

    const hist2 = await (await fetch(`${baseUrl}/api/signatures/${testSignature}/history?projectId=demo-shop`)).json() as any;
    assert.strictEqual(hist2.occurrences, countAfterRun1 + 1, 'Occurrences must increment by 1 for new distinct run');
  });

  test('4. Known fix: registering known-fix stores unverified; ambiguous signature without projectId returns 409', async () => {
    assert.ok(testSignature, 'testSignature must be set from test 3');

    // With explicit projectId -> stored unverified
    const fixRes = await fetch(`${baseUrl}/api/signatures/${testSignature}/known-fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'demo-shop',
        note: 'Run npm install locally and commit lockfile',
        author: 'Dev Engineer'
      })
    });
    assert.strictEqual(fixRes.status, 200);
    const fixBody = await fixRes.json() as any;
    assert.strictEqual(fixBody.success, true);
    assert.strictEqual(fixBody.knownFix.verificationStatus, 'unverified');

    // Ambiguous signature without projectId on unknown signature -> 409 Conflict
    const ambiguousRes = await fetch(`${baseUrl}/api/signatures/unknown_nonexistent_sig_999/known-fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: 'Attempted fix'
      })
    });
    assert.strictEqual(ambiguousRes.status, 409);
    const ambBody = await ambiguousRes.json() as any;
    assert.strictEqual(ambBody.error.code, 'AMBIGUOUS_SIGNATURE');
  });

  test('5. Resolution & verification: green run resolves signature and verifies known fix', async () => {
    assert.ok(testSignature, 'testSignature must be set');

    // Insert subsequent successful run with completedAt ahead of lastSeen
    const greenRes = await fetch(`${baseUrl}/api/ingest/demo-shop`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        run: {
          externalId: `${runPrefix}_green_1`,
          branch: 'main',
          sha: 'sha-resolved-green',
          workflow: 'CI Build & Test',
          status: 'success',
          completedAt: new Date(Date.now() + 2000).toISOString()
        }
      })
    });
    assert.strictEqual(greenRes.status, 200);

    // Call stats to reconcile signatures
    await fetch(`${baseUrl}/api/stats/overview?projectId=demo-shop`);

    // Verify signature is resolved and fix is verified
    const hist = await (await fetch(`${baseUrl}/api/signatures/${testSignature}/history?projectId=demo-shop`)).json() as any;
    assert.strictEqual(hist.status, 'resolved');
    assert.strictEqual(hist.knownFix?.verificationStatus, 'verified');
  });

  test('6. Regression: same failure recurring marks status regressed', async () => {
    assert.ok(testSignature, 'testSignature must be set');

    const lockLog = `
npm error code EUSAGE
npm error \`npm ci\` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: test-pkg@1.0.0 from lock file
`;
    const res = await fetch(`${baseUrl}/api/ingest/demo-shop`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        run: {
          externalId: `${runPrefix}_regr_1`,
          branch: 'main',
          sha: 'sha-regressed-1',
          workflow: 'CI Build & Test',
          status: 'failure'
        },
        log: lockLog
      })
    });
    assert.strictEqual(res.status, 200);

    const histAfter = await (await fetch(`${baseUrl}/api/signatures/${testSignature}/history?projectId=demo-shop`)).json() as any;
    assert.strictEqual(histAfter.status, 'regressed');
    assert.ok(histAfter.knownFix?.note.length > 0, 'Original fix note should be returned on regression');
  });

  test('7. Flaky test math: same-SHA flip results in watch then flaky verdict', async () => {
    const testId = `test_login_${Date.now()}`;
    const headSha = 'commit-flip-sha-123';

    // Execution 1: Pass
    const res1 = await fetch(`${baseUrl}/api/ingest/demo-shop`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        run: { externalId: `${runPrefix}_flaky_1`, branch: 'main', sha: headSha, workflow: 'Test', status: 'success' },
        tests: [{ testId, outcome: 'pass', durationMs: 120 }]
      })
    });
    assert.strictEqual(res1.status, 200);

    // Execution 2: Fail (Same SHA flip!)
    const res2 = await fetch(`${baseUrl}/api/ingest/demo-shop`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        run: { externalId: `${runPrefix}_flaky_2`, branch: 'main', sha: headSha, workflow: 'Test', status: 'failure' },
        tests: [{ testId, outcome: 'fail', durationMs: 140, errorMessage: 'Network reset' }]
      })
    });
    assert.strictEqual(res2.status, 200);

    // Check with 2 runs: should be 'watch' because < 5 executions
    let flakyData = await (await fetch(`${baseUrl}/api/flaky?projectId=demo-shop`)).json() as any;
    let tRecord = flakyData.tests.find((t: any) => t.testId === testId);
    if (tRecord) {
      assert.strictEqual(tRecord.verdict, 'watch', 'Under 5 executions must be watch');
    }

    // Add runs 3, 4, 5 to reach 5 executions
    for (let i = 3; i <= 5; i++) {
      const resI = await fetch(`${baseUrl}/api/ingest/demo-shop`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          run: { externalId: `${runPrefix}_flaky_${i}`, branch: 'main', sha: `sha-${i}`, workflow: 'Test', status: 'success' },
          tests: [{ testId, outcome: 'pass', durationMs: 100 }]
        })
      });
      assert.strictEqual(resI.status, 200);
    }

    // With 5 runs and a same-sha flip: verdict must be 'flaky'
    flakyData = await (await fetch(`${baseUrl}/api/flaky?projectId=demo-shop`)).json() as any;
    tRecord = flakyData.tests.find((t: any) => t.testId === testId);
    assert.ok(tRecord, 'Test record must exist in flaky tests');
    assert.strictEqual(tRecord.verdict, 'flaky', '>=5 runs with same-sha flip must be flaky');
  });
});

