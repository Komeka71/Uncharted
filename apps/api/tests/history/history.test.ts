import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { MongoClient, Db } from 'mongodb';
import {
  ensureHistoryIndexes,
  recordFailureOccurrence,
  recordKnownFix,
  reconcileSignatureStatuses,
  resolveCommitRange,
  buildHistoricalContext
} from '../../src/history/historyService.js';

describe('MongoDB History Service Integration', () => {
  const mongoUri = process.env.MONGODB_TEST_URI;

  test('buildHistoricalContext returns valid typed fallback when db is null', async () => {
    const context = await buildHistoricalContext(null, {
      projectId: 'test-proj',
      signature: 'sig-offline-123',
      currentRunId: 'run-1',
      currentSha: 'sha-1'
    });

    assert.strictEqual(context.runId, 'run-1');
    assert.strictEqual(context.signature, 'sig-offline-123');
    assert.strictEqual(context.historicalOccurrences, 1);
    assert.strictEqual(context.isFirstOccurrence, true);
    assert.strictEqual(context.dataQuality.dbAvailable, false);
    assert.ok(context.dataQuality.notes.length > 0);
  });

  if (!mongoUri) {
    test('Live MongoDB integration tests skipped (MONGODB_TEST_URI not set)', () => {
      console.log('Skipping live MongoDB integration tests: MONGODB_TEST_URI is not set.');
      assert.ok(true);
    });
    return;
  }

  // Live MongoDB Tests with throwaway database
  let client: MongoClient | null = null;
  let db: Db | null = null;
  const testDbName = `culprit_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  before(async () => {
    // Safety check: protect production databases
    if (!testDbName.startsWith('culprit_test_')) {
      throw new Error(`Refusing to run tests against non-test database: ${testDbName}`);
    }

    try {
      client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 });
      await client.connect();
      db = client.db(testDbName);
    } catch (err: any) {
      console.warn(`[history.test] Could not connect to MongoDB at ${mongoUri}: ${err.message}. Skipping live tests.`);
      client = null;
      db = null;
    }
  });

  after(async () => {
    if (client && db) {
      try {
        if (testDbName.startsWith('culprit_test_')) {
          await db.dropDatabase();
        }
      } catch (err: any) {
        console.warn(`[history.test] Failed to drop test database: ${err.message}`);
      } finally {
        await client.close();
      }
    }
  });


  test('ensureHistoryIndexes creates indexes idempotently without error', async () => {
    if (!db) return;
    await ensureHistoryIndexes(db);
    // Second invocation should be memoized and safe
    await ensureHistoryIndexes(db);

    const sigIndexes = await db.collection('signatures').indexes();
    const indexNames = sigIndexes.map((idx) => idx.name);
    assert.ok(indexNames.includes('hist_signatures_project_signature'));
  });

  test('recordFailureOccurrence is idempotent for same run and increments for new run', async () => {
    if (!db) return;
    const projectId = 'proj-test-1';
    const signature = 'sig-dup-test';

    // 1st analysis of run-100
    const res1 = await recordFailureOccurrence(db, {
      projectId,
      signature,
      runId: 'run-100',
      headSha: 'sha-100'
    });
    assert.strictEqual(res1.occurrences, 1);
    assert.strictEqual(res1.isFirstOccurrence, true);

    // 2nd analysis of same run-100 (re-run or webhook retry)
    const res2 = await recordFailureOccurrence(db, {
      projectId,
      signature,
      runId: 'run-100',
      headSha: 'sha-100'
    });
    assert.strictEqual(res2.occurrences, 1, 'Idempotent analysis must NOT increment occurrence count');
    assert.strictEqual(res2.isFirstOccurrence, true);

    // 3rd analysis: different run-101
    const res3 = await recordFailureOccurrence(db, {
      projectId,
      signature,
      runId: 'run-101',
      headSha: 'sha-101'
    });
    assert.strictEqual(res3.occurrences, 2, 'New run failure must increment occurrence count');
    assert.strictEqual(res3.isFirstOccurrence, false);
  });

  test('recordKnownFix stores fix as unverified without resolving signature', async () => {
    if (!db) return;
    const projectId = 'proj-test-2';
    const signature = 'sig-known-fix';

    await recordFailureOccurrence(db, {
      projectId,
      signature,
      runId: 'run-200',
      headSha: 'sha-200'
    });

    const fix = await recordKnownFix(db, {
      projectId,
      signature,
      note: 'Pin package-lock to 2.1.0',
      commitSha: 'fix-sha-1',
      author: 'dev-alice'
    });

    assert.strictEqual(fix.verificationStatus, 'unverified');

    // Signature must STILL be open!
    const sigDoc = await db.collection('signatures').findOne({ projectId, signature });
    assert.strictEqual(sigDoc?.status, 'open', 'Registering a known-fix note must NOT mark signature resolved');
    assert.strictEqual(sigDoc?.knownFix?.verificationStatus, 'unverified');
  });

  test('reconcileSignatureStatuses marks signature resolved and verifies known fix on subsequent green run', async () => {
    if (!db) return;
    const projectId = 'proj-test-3';
    const signature = 'sig-reconcile';

    const failTime = new Date('2026-10-31T01:00:00Z');
    await recordFailureOccurrence(db, {
      projectId,
      signature,
      runId: 'run-300',
      headSha: 'sha-300',
      now: failTime
    });

    await recordKnownFix(db, {
      projectId,
      signature,
      note: 'Fix timeout',
      now: failTime
    });

    // Insert subsequent green run
    await db.collection('runs').insertOne({
      runId: 'run-301',
      projectId,
      workflow: 'CI',
      branch: 'main',
      headSha: 'sha-301',
      conclusion: 'success',
      status: 'completed',
      startedAt: new Date('2026-10-31T02:00:00Z'),
      completedAt: new Date('2026-10-31T02:05:00Z')
    });

    const { resolvedCount } = await reconcileSignatureStatuses(db, projectId);
    assert.ok(resolvedCount >= 1);

    const updatedSig = await db.collection('signatures').findOne({ projectId, signature });
    assert.strictEqual(updatedSig?.status, 'resolved');
    assert.strictEqual(updatedSig?.knownFix?.verificationStatus, 'verified');
  });

  test('resolveCommitRange finds baseline SHA from prior green run', async () => {
    if (!db) return;
    const projectId = 'proj-test-4';

    await db.collection('runs').insertMany([
      {
        runId: 'r-prior-green',
        projectId,
        branch: 'main',
        headSha: 'sha-prior-green',
        conclusion: 'success',
        startedAt: new Date('2026-10-31T01:00:00Z'),
        completedAt: new Date('2026-10-31T01:10:00Z')
      },
      {
        runId: 'r-current-fail',
        projectId,
        branch: 'main',
        headSha: 'sha-current-fail',
        conclusion: 'failure',
        startedAt: new Date('2026-10-31T02:00:00Z'),
        completedAt: new Date('2026-10-31T02:10:00Z')
      }
    ]);

    const range = await resolveCommitRange(db, {
      projectId,
      headSha: 'sha-current-fail',
      branch: 'main'
    });

    assert.strictEqual(range.status, 'resolved');
    assert.strictEqual(range.baseSha, 'sha-prior-green');
    assert.strictEqual(range.headSha, 'sha-current-fail');
  });
});
