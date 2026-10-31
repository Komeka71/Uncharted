import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  evaluateSignatureState,
  calculateEpisodesAndMttr
} from '../src/history/signature-state.js';
import { evaluateKnownFix } from '../src/history/known-fix.js';
import { ScopeRun, FailureOccurrenceRecord } from '../src/history/types.js';

describe('Historical Intelligence: Signature State Machine', () => {
  test('first occurrence of a signature produces occurrences=1, isFirstOccurrence=true, status=open', () => {
    const res = evaluateSignatureState({
      currentRunId: 'run_1',
      currentRunStartedAt: '2026-10-31T01:00:00Z',
      currentScope: { workflow: 'build.yml', branch: 'main' },
      existingOccurrences: [],
      scopeRuns: []
    });

    assert.strictEqual(res.historicalOccurrences, 1);
    assert.strictEqual(res.isFirstOccurrence, true);
    assert.strictEqual(res.status, 'open');
    assert.strictEqual(res.isRegression, false);
    assert.strictEqual(res.regressionCount, 0);
    assert.strictEqual(res.previousOccurrences.length, 0);
  });

  test('repeat occurrence increments count and attaches previous occurrences (newest first)', () => {
    const existing: FailureOccurrenceRecord[] = [
      {
        runId: 'run_1',
        projectId: 'p1',
        signature: 'sig_1',
        branch: 'main',
        headSha: 'sha1',
        createdAt: '2026-10-25T10:00:00Z'
      },
      {
        runId: 'run_2',
        projectId: 'p1',
        signature: 'sig_1',
        branch: 'main',
        headSha: 'sha2',
        createdAt: '2026-10-26T10:00:00Z'
      }
    ];

    const res = evaluateSignatureState({
      currentRunId: 'run_3',
      currentRunStartedAt: '2026-10-27T10:00:00Z',
      currentScope: { workflow: 'build.yml', branch: 'main' },
      existingOccurrences: existing,
      scopeRuns: []
    });

    assert.strictEqual(res.historicalOccurrences, 3);
    assert.strictEqual(res.isFirstOccurrence, false);
    assert.strictEqual(res.status, 'open');
    assert.strictEqual(res.previousOccurrences.length, 2);
    assert.strictEqual(res.previousOccurrences[0].runId, 'run_2', 'Newest occurrence should be first');
    assert.strictEqual(res.previousOccurrences[1].runId, 'run_1');
  });

  test('same run analysed twice does NOT inflate occurrence count (idempotent)', () => {
    const existing: FailureOccurrenceRecord[] = [
      {
        runId: 'run_1',
        projectId: 'p1',
        signature: 'sig_1',
        branch: 'main',
        createdAt: '2026-10-25T10:00:00Z'
      },
      {
        runId: 'run_2',
        projectId: 'p1',
        signature: 'sig_1',
        branch: 'main',
        createdAt: '2026-10-26T10:00:00Z'
      }
    ];

    // Re-analyzing run_2
    const res = evaluateSignatureState({
      currentRunId: 'run_2',
      currentRunStartedAt: '2026-10-26T10:00:00Z',
      currentScope: { workflow: 'build.yml', branch: 'main' },
      existingOccurrences: existing,
      scopeRuns: []
    });

    assert.strictEqual(res.historicalOccurrences, 2, 'Occurrences count must remain 2');
    assert.strictEqual(res.isFirstOccurrence, false);
    assert.strictEqual(res.previousOccurrences.length, 1);
    assert.strictEqual(res.previousOccurrences[0].runId, 'run_1');
  });

  test('regression: resolved signature reappearing flags isRegression=true and status=regressed', () => {
    const existing: FailureOccurrenceRecord[] = [
      {
        runId: 'run_fail_1',
        projectId: 'p1',
        signature: 'sig_1',
        branch: 'main',
        createdAt: '2026-10-20T10:00:00Z'
      }
    ];

    // A green run happened between fail_1 and fail_2
    const scopeRuns: ScopeRun[] = [
      {
        runId: 'run_fail_1',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha_f1',
        conclusion: 'failure',
        startedAt: '2026-10-20T10:00:00Z',
        completedAt: '2026-10-20T10:05:00Z'
      },
      {
        runId: 'run_green_1',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha_g1',
        conclusion: 'success',
        startedAt: '2026-10-22T12:00:00Z',
        completedAt: '2026-10-22T12:05:00Z'
      }
    ];

    const res = evaluateSignatureState({
      currentRunId: 'run_fail_2',
      currentRunStartedAt: '2026-10-25T09:00:00Z',
      currentScope: { workflow: 'ci.yml', branch: 'main' },
      existingOccurrences: existing,
      scopeRuns,
      previousRegressionCount: 0
    });

    assert.strictEqual(res.historicalOccurrences, 2);
    assert.strictEqual(res.isRegression, true, 'Must flag regression');
    assert.strictEqual(res.status, 'regressed');
    assert.strictEqual(res.regressionCount, 1);
  });

  test('signature resolved again when a subsequent green run succeeds in the scope', () => {
    const existing: FailureOccurrenceRecord[] = [
      {
        runId: 'run_fail_1',
        projectId: 'p1',
        signature: 'sig_1',
        branch: 'main',
        createdAt: '2026-10-20T10:00:00Z'
      }
    ];

    const scopeRuns: ScopeRun[] = [
      {
        runId: 'run_fail_1',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha1',
        conclusion: 'failure',
        startedAt: '2026-10-20T10:00:00Z',
        completedAt: '2026-10-20T10:05:00Z'
      },
      {
        runId: 'run_green_2',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha2',
        conclusion: 'success',
        startedAt: '2026-10-21T10:00:00Z',
        completedAt: '2026-10-21T10:04:00Z'
      }
    ];

    const res = evaluateSignatureState({
      currentRunId: 'run_fail_1',
      currentRunStartedAt: '2026-10-20T10:00:00Z',
      currentScope: { workflow: 'ci.yml', branch: 'main' },
      existingOccurrences: existing,
      scopeRuns,
      previousRegressionCount: 0
    });

    assert.strictEqual(res.status, 'resolved');
    assert.ok(res.resolvedAt);
  });
});

describe('Historical Intelligence: Known Fix State Machine', () => {
  test('transitions unverified -> verified when green run happens after fixedAt in scope', () => {
    const fix = {
      note: 'Updated lockfile with npm install',
      author: 'Jane Doe',
      fixedAt: '2026-10-25T12:00:00Z',
      verificationStatus: 'unverified' as const
    };

    const scopeRuns: ScopeRun[] = [
      {
        runId: 'run_fail',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha1',
        conclusion: 'failure',
        startedAt: '2026-10-25T11:00:00Z',
        completedAt: '2026-10-25T11:05:00Z'
      },
      {
        runId: 'run_green',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha2',
        conclusion: 'success',
        startedAt: '2026-10-25T14:00:00Z',
        completedAt: '2026-10-25T14:05:00Z'
      }
    ];

    const res = evaluateKnownFix({
      knownFix: fix,
      scopeRuns,
      signatureOccurrences: []
    });

    assert.ok(res);
    assert.strictEqual(res.verificationStatus, 'verified');
    assert.strictEqual(res.verifiedByRunId, 'run_green');
    assert.ok(res.verifiedAt);
  });

  test('transitions unverified -> ineffective when failure with same signature recurs after fixedAt without green run', () => {
    const fix = {
      note: 'Attempted to bump package version',
      author: 'Bob',
      fixedAt: '2026-10-25T12:00:00Z',
      verificationStatus: 'unverified' as const
    };

    const scopeRuns: ScopeRun[] = [
      {
        runId: 'run_fail_after_fix',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha3',
        conclusion: 'failure',
        startedAt: '2026-10-25T15:00:00Z',
        completedAt: '2026-10-25T15:05:00Z'
      }
    ];

    const signatureOccurrences: FailureOccurrenceRecord[] = [
      {
        runId: 'run_fail_after_fix',
        projectId: 'p1',
        signature: 'sig_1',
        createdAt: '2026-10-25T15:00:00Z'
      }
    ];

    const res = evaluateKnownFix({
      knownFix: fix,
      scopeRuns,
      signatureOccurrences
    });

    assert.ok(res);
    assert.strictEqual(res.verificationStatus, 'ineffective');
  });

  test('legacy known fix without verificationStatus defaults to unverified', () => {
    const legacyFix = {
      note: 'Legacy note from earlier version',
      fixedAt: '2026-10-20T10:00:00Z'
    };

    const res = evaluateKnownFix({
      knownFix: legacyFix,
      scopeRuns: [],
      signatureOccurrences: []
    });

    assert.ok(res);
    assert.strictEqual(res.verificationStatus, 'unverified');
  });
});

describe('Historical Intelligence: MTTR Calculation', () => {
  test('calculates accurate recovery time across resolved failure episodes', () => {
    const failures: FailureOccurrenceRecord[] = [
      {
        runId: 'f1',
        projectId: 'p1',
        signature: 'sig_1',
        createdAt: '2026-10-25T10:00:00Z'
      },
      {
        runId: 'f2',
        projectId: 'p1',
        signature: 'sig_1',
        createdAt: '2026-10-26T10:00:00Z'
      }
    ];

    const scopeRuns: ScopeRun[] = [
      {
        runId: 'f1',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha1',
        conclusion: 'failure',
        startedAt: '2026-10-25T10:00:00Z',
        completedAt: '2026-10-25T10:05:00Z'
      },
      {
        runId: 'g1',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha2',
        conclusion: 'success',
        startedAt: '2026-10-25T12:00:00Z',
        completedAt: '2026-10-25T12:05:00Z' // 2 hours to resolve f1
      },
      {
        runId: 'f2',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha3',
        conclusion: 'failure',
        startedAt: '2026-10-26T10:00:00Z',
        completedAt: '2026-10-26T10:05:00Z'
      },
      {
        runId: 'g2',
        workflow: 'ci.yml',
        branch: 'main',
        headSha: 'sha4',
        conclusion: 'success',
        startedAt: '2026-10-26T14:00:00Z',
        completedAt: '2026-10-26T14:05:00Z' // 4 hours to resolve f2
      }
    ];

    const result = calculateEpisodesAndMttr(failures, scopeRuns);
    assert.strictEqual(result.sampleSize, 2);
    // (2.08h + 4.08h) / 2 = ~3.1h
    assert.ok(result.averageMttrHours >= 2.0 && result.averageMttrHours <= 4.0);
  });

  test('returns averageMttrHours: 0 and sampleSize: 0 when no resolved episodes exist (no fake numbers)', () => {
    const result = calculateEpisodesAndMttr([], []);
    assert.strictEqual(result.averageMttrHours, 0);
    assert.strictEqual(result.sampleSize, 0);
    assert.strictEqual(result.episodes.length, 0);
  });
});
