import { test, describe } from 'node:test';
import assert from 'node:assert';
import { analyzeLogDeterministically } from '../src/index.js';

describe('Fingerprint Stability', () => {
  test('two runs with different timestamps, durations, and runner paths yield the SAME signature', () => {
    const run1 = `2026-10-31T08:14:12.112Z ##[group]Run test
/home/runner/work/repo1/repo1/src/auth.ts(12,4): error TS2339: Property 'foo' does not exist on type 'User'.
Finished in 2.34s with exit code 2
##[error]Process completed with exit code 2.`;

    const run2 = `2026-11-04T19:45:00.999Z ##[group]Run test
/home/runner/work/repo2/repo2/src/auth.ts(12,4): error TS2339: Property 'foo' does not exist on type 'User'.
Finished in 8.12s with exit code 2
##[error]Process completed with exit code 2.`;

    const res1 = analyzeLogDeterministically(run1);
    const res2 = analyzeLogDeterministically(run2);

    assert.strictEqual(res1.fingerprint.signature, res2.fingerprint.signature, 'Signatures must match across volatile differences');
    assert.strictEqual(res1.fingerprint.signature.length, 16);
  });

  test('different errors yield different signatures', () => {
    const runTS = `src/auth.ts:1: error TS2339: Property 'a' does not exist`;
    const runLock = `npm ERR! npm ci can only install packages when your package.json and package-lock.json are in sync`;

    const resTS = analyzeLogDeterministically(runTS);
    const resLock = analyzeLogDeterministically(runLock);

    assert.notStrictEqual(resTS.fingerprint.signature, resLock.fingerprint.signature);
  });
});
