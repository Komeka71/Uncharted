import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateFlakeStats } from '../src/flake/index.js';
import { TestOutcomeRecord } from '../src/types/index.js';

describe('Flake Math Engine', () => {
  test('flags test with same-SHA flip as flaky', () => {
    const records: TestOutcomeRecord[] = [
      { runId: 'r1', headSha: 'sha1', outcome: 'pass', timestamp: new Date('2026-10-31T01:00:00Z') },
      { runId: 'r2', headSha: 'sha2', outcome: 'pass', timestamp: new Date('2026-10-31T02:00:00Z') },
      { runId: 'r3', headSha: 'sha3', outcome: 'fail', timestamp: new Date('2026-10-31T03:00:00Z'), errorMessage: 'Timeout 5000ms' },
      { runId: 'r4', headSha: 'sha3', outcome: 'pass', timestamp: new Date('2026-10-31T04:00:00Z') }, // Re-run passed on same commit!
      { runId: 'r5', headSha: 'sha4', outcome: 'pass', timestamp: new Date('2026-10-31T05:00:00Z') }
    ];

    const stats = calculateFlakeStats('suite › flaky-network-test', records);

    assert.strictEqual(stats.verdict, 'flaky');
    assert.strictEqual(stats.sameShaFlips, 1, 'Must detect 1 same-SHA flip');
    assert.strictEqual(stats.assessment.evidence, 'sufficient');
    assert.ok(stats.recommendation.includes('Quarantine candidate'));
  });

  test('flags consistently failing test as broken', () => {
    const records: TestOutcomeRecord[] = [
      { runId: 'r1', headSha: 'sha1', outcome: 'fail', timestamp: new Date('2026-10-31T01:00:00Z') },
      { runId: 'r2', headSha: 'sha2', outcome: 'fail', timestamp: new Date('2026-10-31T02:00:00Z') },
      { runId: 'r3', headSha: 'sha3', outcome: 'fail', timestamp: new Date('2026-10-31T03:00:00Z') },
      { runId: 'r4', headSha: 'sha4', outcome: 'fail', timestamp: new Date('2026-10-31T04:00:00Z') },
      { runId: 'r5', headSha: 'sha5', outcome: 'fail', timestamp: new Date('2026-10-31T05:00:00Z') }
    ];

    const stats = calculateFlakeStats('suite › syntax-broken-test', records);

    assert.strictEqual(stats.verdict, 'broken');
    assert.strictEqual(stats.sameShaFlips, 0);
  });

  test('flags consistently passing test as stable', () => {
    const records: TestOutcomeRecord[] = Array.from({ length: 10 }, (_, i) => ({
      runId: `r${i}`,
      headSha: `sha${i}`,
      outcome: 'pass',
      timestamp: new Date(`2026-10-31T${String(i).padStart(2, '0')}:00:00Z`)
    }));

    const stats = calculateFlakeStats('suite › rock-solid-test', records);

    assert.strictEqual(stats.verdict, 'stable');
    assert.strictEqual(stats.fails, 0);
    assert.strictEqual(stats.assessment.evidence, 'sufficient');
  });

  test('flags test with fewer than 5 executions as watch', () => {
    const records: TestOutcomeRecord[] = [
      { runId: 'r1', headSha: 'sha1', outcome: 'fail', timestamp: new Date('2026-10-31T01:00:00Z') },
      { runId: 'r2', headSha: 'sha2', outcome: 'pass', timestamp: new Date('2026-10-31T02:00:00Z') }
    ];

    const stats = calculateFlakeStats('suite › new-test', records);

    assert.strictEqual(stats.verdict, 'watch');
    assert.strictEqual(stats.assessment.evidence, 'insufficient');
  });

  test('excludes skipped records from totalRuns and flakeRate', () => {
    const records: TestOutcomeRecord[] = [
      { runId: 'r1', headSha: 'sha1', outcome: 'pass', timestamp: new Date('2026-10-31T01:00:00Z') },
      { runId: 'r2', headSha: 'sha2', outcome: 'skipped', timestamp: new Date('2026-10-31T02:00:00Z') },
      { runId: 'r3', headSha: 'sha3', outcome: 'skipped', timestamp: new Date('2026-10-31T03:00:00Z') },
      { runId: 'r4', headSha: 'sha4', outcome: 'pass', timestamp: new Date('2026-10-31T04:00:00Z') },
      { runId: 'r5', headSha: 'sha5', outcome: 'fail', timestamp: new Date('2026-10-31T05:00:00Z') }
    ];

    const stats = calculateFlakeStats('suite › skip-test', records);

    // Only 3 non-skipped runs: 2 pass, 1 fail
    assert.strictEqual(stats.totalRuns, 3);
    assert.strictEqual(stats.passes, 2);
    assert.strictEqual(stats.fails, 1);
    assert.strictEqual(stats.flakeRate, 0.33);
    assert.strictEqual(stats.assessment.evidence, 'insufficient'); // < 5 runs
  });

  test('flags mixed outcomes without same-commit flip and < 3 flips as watch', () => {
    // 6 executions across 6 distinct commits: pass, pass, pass, fail, pass, pass (1 flip to fail, 1 flip to pass = 2 flips)
    const records: TestOutcomeRecord[] = [
      { runId: 'r1', headSha: 'sha1', outcome: 'pass', timestamp: new Date('2026-10-31T01:00:00Z') },
      { runId: 'r2', headSha: 'sha2', outcome: 'pass', timestamp: new Date('2026-10-31T02:00:00Z') },
      { runId: 'r3', headSha: 'sha3', outcome: 'pass', timestamp: new Date('2026-10-31T03:00:00Z') },
      { runId: 'r4', headSha: 'sha4', outcome: 'fail', timestamp: new Date('2026-10-31T04:00:00Z') },
      { runId: 'r5', headSha: 'sha5', outcome: 'pass', timestamp: new Date('2026-10-31T05:00:00Z') },
      { runId: 'r6', headSha: 'sha6', outcome: 'pass', timestamp: new Date('2026-10-31T06:00:00Z') }
    ];

    const stats = calculateFlakeStats('suite › isolated-failure-test', records);

    assert.strictEqual(stats.verdict, 'watch', 'Isolated failure across commits with <3 flips should be watch, not flaky');
    assert.strictEqual(stats.sameShaFlips, 0);
    assert.strictEqual(stats.flips, 2);
    assert.strictEqual(stats.assessment.evidence, 'sufficient');
    assert.ok(stats.recommendation.includes('Monitor before quarantining'));
  });
});

