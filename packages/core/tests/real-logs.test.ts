import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLogDeterministically } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '../fixtures', name), 'utf8');
}

describe('Real CI Log Classification (A2)', () => {
  test('classifies real_npm_lockfile.log as npm-lock-out-of-sync', () => {
    const log = loadFixture('real_npm_lockfile.log');
    const res = analyzeLogDeterministically(log);

    assert.strictEqual(res.ruleMatch.ruleId, 'npm-lock-out-of-sync');
    assert.strictEqual(res.ruleMatch.category, 'dependency');
    assert.strictEqual(res.ruleMatch.transient, false);
    assert.ok(res.fingerprint.signature.length === 16);
  });

  test('classifies real_ts_error.log as ts-compile-error with extracted entities', () => {
    const log = loadFixture('real_ts_error.log');
    const res = analyzeLogDeterministically(log);

    assert.strictEqual(res.ruleMatch.ruleId, 'ts-compile-error');
    assert.strictEqual(res.ruleMatch.category, 'build_compile');
    assert.strictEqual(res.ruleMatch.transient, false);
    assert.strictEqual(res.ruleMatch.extracted.file, 'src/cart.ts');
    assert.strictEqual(res.ruleMatch.extracted.line, 13);
    assert.strictEqual(res.ruleMatch.extracted.code, 'TS2339');
    assert.ok(res.fingerprint.signature.length === 16);
  });

  test('classifies real_env_missing_vitest.log as env-var-missing (mentions API_URL)', () => {
    const log = loadFixture('real_env_missing_vitest.log');
    const res = analyzeLogDeterministically(log);

    assert.strictEqual(res.ruleMatch.ruleId, 'env-var-missing');
    assert.strictEqual(res.ruleMatch.category, 'config_env');
    assert.strictEqual(res.ruleMatch.transient, false);
    assert.strictEqual(res.ruleMatch.extracted.envVar, 'API_URL');
    assert.ok(res.fingerprint.signature.length === 16);
  });

  test('classifies real_network_reset_vitest.log as network-reset with transient: true', () => {
    const log = loadFixture('real_network_reset_vitest.log');
    const res = analyzeLogDeterministically(log);

    assert.strictEqual(res.ruleMatch.ruleId, 'network-reset');
    assert.strictEqual(res.ruleMatch.category, 'network_transient');
    assert.strictEqual(res.ruleMatch.transient, true);
    assert.ok(res.fingerprint.signature.length === 16);
  });

  test('classifies real_vitest_flaky_timeout.log as vitest-failure', () => {
    const log = loadFixture('real_vitest_flaky_timeout.log');
    const res = analyzeLogDeterministically(log);

    assert.strictEqual(res.ruleMatch.ruleId, 'vitest-failure');
    assert.strictEqual(res.ruleMatch.category, 'test_failure');
    assert.strictEqual(res.ruleMatch.transient, false);
    assert.ok(res.fingerprint.signature.length === 16);
  });

  test('signature determinism and distinction across real logs', () => {
    const logs = [
      loadFixture('real_npm_lockfile.log'),
      loadFixture('real_ts_error.log'),
      loadFixture('real_env_missing_vitest.log'),
      loadFixture('real_network_reset_vitest.log'),
      loadFixture('real_vitest_flaky_timeout.log')
    ];

    const results = logs.map((l) => analyzeLogDeterministically(l));
    const signatures = results.map((r) => r.fingerprint.signature);

    // Each same log produces identical signature
    logs.forEach((log, idx) => {
      const repeat = analyzeLogDeterministically(log);
      assert.strictEqual(repeat.fingerprint.signature, signatures[idx], `Log ${idx} must be deterministic`);
    });

    // All distinct logs must have distinct signatures
    const uniqueSignatures = new Set(signatures);
    assert.strictEqual(uniqueSignatures.size, signatures.length, 'All 5 real logs must have distinct signatures');
  });
});
