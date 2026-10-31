import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseJUnitXml, parseJestJson } from '../src/parsers/index.js';

describe('Test Parsers', () => {
  test('parses valid JUnit XML correctly', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Jest Tests" tests="2" failures="1" time="3.12">
  <testsuite name="Billing" tests="2" failures="1" errors="0" time="2.45" file="src/billing.test.ts">
    <testcase classname="Billing" name="renders invoice" time="0.12"/>
    <testcase classname="Billing" name="applies coupon" time="0.34">
      <failure message="expected 90 to equal 100">AssertionError: expected 90 to equal 100</failure>
    </testcase>
  </testsuite>
</testsuites>`;

    const results = parseJUnitXml(xml);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].outcome, 'pass');
    assert.strictEqual(results[1].outcome, 'fail');
    assert.ok(results[1].errorMessage?.includes('expected 90 to equal 100'));
  });

  test('parses valid Jest JSON correctly', () => {
    const json = JSON.stringify({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
      testResults: [
        {
          testFilePath: '/app/src/auth.test.ts',
          assertionResults: [
            {
              title: 'logs in user',
              status: 'passed',
              duration: 50
            },
            {
              title: 'fails invalid token',
              status: 'failed',
              duration: 20,
              failureMessages: ['Token expired']
            }
          ]
        }
      ]
    });

    const results = parseJestJson(json);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].outcome, 'pass');
    assert.strictEqual(results[1].outcome, 'fail');
    assert.strictEqual(results[1].errorMessage, 'Token expired');
  });

  test('rejects malformed JUnit XML with descriptive error', () => {
    assert.throws(() => {
      parseJUnitXml('<<<not xml>>>');
    }, /Malformed JUnit XML/);
  });

  test('rejects malformed Jest JSON with descriptive error', () => {
    assert.throws(() => {
      parseJestJson('{ "invalid": true');
    }, /Malformed Jest JSON/);
  });
});
