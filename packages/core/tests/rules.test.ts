import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLogDeterministically } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Deterministic Rules Engine', () => {
  const cases = [
    { file: 'npm_lock_out_of_sync.log', expectedRule: 'npm-lock-out-of-sync', category: 'dependency', transient: false },
    { file: 'npm_module_not_found.log', expectedRule: 'npm-module-not-found', category: 'dependency', transient: false },
    { file: 'ts_compile_error.log', expectedRule: 'ts-compile-error', category: 'build_compile', transient: false },
    { file: 'jest_assertion.log', expectedRule: 'jest-assertion', category: 'test_failure', transient: false },
    { file: 'pytest_failure.log', expectedRule: 'pytest-failure', category: 'test_failure', transient: false },
    { file: 'env_var_missing.log', expectedRule: 'env-var-missing', category: 'config_env', transient: false },
    { file: 'docker_pull_rate_limit.log', expectedRule: 'docker-pull-rate-limit', category: 'docker_container', transient: true },
    { file: 'docker_build_fail.log', expectedRule: 'docker-build-fail', category: 'docker_container', transient: false },
    { file: 'network_reset.log', expectedRule: 'network-reset', category: 'network_transient', transient: true },
    { file: 'disk_full.log', expectedRule: 'disk-full', category: 'infra_runner', transient: true },
    { file: 'oom_heap.log', expectedRule: 'oom', category: 'infra_runner', transient: true },
    { file: 'eslint_failure.log', expectedRule: 'eslint-failure', category: 'lint_format', transient: false },
    { file: 'gh_permission_denied.log', expectedRule: 'gh-permission-denied', category: 'permissions_secrets', transient: false },
    { file: 'test_timeout.log', expectedRule: 'test-timeout', category: 'test_failure', transient: true },
    { file: 'job_timeout.log', expectedRule: 'job-timeout', category: 'timeout', transient: true }
  ];

  for (const c of cases) {
    test(`correctly classifies ${c.file} as ${c.expectedRule}`, () => {
      const log = readFileSync(join(__dirname, '../fixtures', c.file), 'utf8');
      const res = analyzeLogDeterministically(log);

      assert.strictEqual(res.ruleMatch.ruleId, c.expectedRule, `Expected ruleId ${c.expectedRule}`);
      assert.strictEqual(res.ruleMatch.category, c.category, `Expected category ${c.category}`);
      assert.strictEqual(res.ruleMatch.transient, c.transient, `Expected transient ${c.transient}`);
      assert.ok(res.ruleMatch.evidence.length > 0, 'Evidence lines must not be empty');
      assert.ok(res.fingerprint.signature.length === 16, 'Signature must be 16 hex characters');
    });
  }

  test('rule precedence: specific failure outranks generic-exit-code when both match', () => {
    // A log that has both a TypeScript compiler error AND an exit code 1 at the end
    const log = [
      'Running build script...',
      'src/server.ts(23,7): error TS2322: Type "string" is not assignable to type "number".',
      'Process completed with exit code 1.'
    ].join('\n');

    const res = analyzeLogDeterministically(log);
    assert.strictEqual(res.ruleMatch.ruleId, 'ts-compile-error', 'Specific ts-compile-error must win over generic-exit-code');
    assert.strictEqual(res.ruleMatch.category, 'build_compile');
    assert.ok(res.ruleMatch.confidence >= 0.95);
  });

  test('rule precedence: high confidence and extracted entities win', () => {
    // Log with npm lock out of sync (0.98) and exit code
    const log = [
      'npm ci can only install packages when your package.json and package-lock.json are in sync',
      'npm ERR! Missing: lodash from lock file',
      'Process completed with exit code 1.'
    ].join('\n');

    const res = analyzeLogDeterministically(log);
    assert.strictEqual(res.ruleMatch.ruleId, 'npm-lock-out-of-sync');
    assert.strictEqual(res.ruleMatch.category, 'dependency');
  });

  test('unknown failure: logs with no recognized patterns return unknown-failure without hallucinating', () => {
    const log = [
      'Starting arbitrary pipeline...',
      'Step 1 succeeded',
      'Something totally strange happened in custom user binary xyz',
      'Stopping execution.'
    ].join('\n');

    const res = analyzeLogDeterministically(log);
    assert.strictEqual(res.ruleMatch.ruleId, 'unknown-failure');
    assert.strictEqual(res.ruleMatch.category, 'unknown');
    assert.strictEqual(res.ruleMatch.confidence, 0.3);
    assert.ok(res.ruleMatch.explanation.includes('No specific signature matched'));
  });

  test('empty log handling produces clean unknown-failure result', () => {
    const res = analyzeLogDeterministically('');
    assert.strictEqual(res.ruleMatch.ruleId, 'unknown-failure');
    assert.strictEqual(res.ruleMatch.category, 'unknown');
    assert.strictEqual(res.parsedLog.cleanedLines.length, 0);
  });
});

