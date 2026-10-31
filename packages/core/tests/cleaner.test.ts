import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseAndCleanLog, stripAnsi, calculateLogWindow } from '../src/cleaner/index.js';

describe('Log Cleaner and Security Boundary', () => {
  test('strips ANSI color codes and formatting sequences', () => {
    const ansiLog = '\u001b[31mERROR:\u001b[0m \u001b[1mFailed to compile TypeScript\u001b[22m';
    const cleaned = stripAnsi(ansiLog);
    assert.strictEqual(cleaned, 'ERROR: Failed to compile TypeScript');
  });

  test('normalizes Windows CRLF and Unix LF line endings', () => {
    const mixedLog = 'line 1\r\nline 2\nline 3\r\nline 4';
    const parsed = parseAndCleanLog(mixedLog);
    assert.strictEqual(parsed.cleanedLines.length, 4);
    assert.strictEqual(parsed.cleanedLines[0].text, 'line 1');
    assert.strictEqual(parsed.cleanedLines[1].text, 'line 2');
    assert.strictEqual(parsed.cleanedLines[2].text, 'line 3');
    assert.strictEqual(parsed.cleanedLines[3].text, 'line 4');
  });

  test('strictly preserves 1:1 original line numbers', () => {
    const log = 'line 1\nline 2\nline 3\nline 4\nline 5';
    const parsed = parseAndCleanLog(log);
    for (let i = 0; i < parsed.cleanedLines.length; i++) {
      assert.strictEqual(parsed.cleanedLines[i].lineNo, i + 1, `Line index ${i} must have lineNo ${i + 1}`);
    }
  });

  test('handles empty and whitespace-only logs safely without throwing', () => {
    const emptyParsed = parseAndCleanLog('');
    assert.strictEqual(emptyParsed.cleanedLines.length, 0);
    assert.strictEqual(emptyParsed.raw, '');

    const nullParsed = parseAndCleanLog(null as any);
    assert.strictEqual(nullParsed.cleanedLines.length, 0);
  });

  test('handles large logs via log windowing preserving head, epicenter, and tail', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 600; i++) {
      if (i === 250) {
        lines.push(`##[error] TS2339: Property 'user' does not exist`);
      } else {
        lines.push(`Step output log line ${i}`);
      }
    }
    const log = lines.join('\n');
    const parsed = parseAndCleanLog(log);

    // Full cleanedLines has all 600
    assert.strictEqual(parsed.cleanedLines.length, 600);

    // windowedLines keeps head (50), epicenter around line 250 (120), and tail (150)
    assert.ok(parsed.windowedLines.length <= 320);
    assert.ok(parsed.windowedLines.some((l) => l.lineNo === 1), 'Must include head');
    assert.ok(parsed.windowedLines.some((l) => l.lineNo === 250), 'Must include error epicenter');
    assert.ok(parsed.windowedLines.some((l) => l.lineNo === 600), 'Must include tail');
  });

  test('SECURITY BOUNDARY: ParsedLog.raw NEVER contains unredacted credentials', () => {
    const sensitiveLog = [
      '2026-10-31T01:00:00Z Build starting...',
      'Setting GITHUB_TOKEN=ghp_ABC1234567890123456789012345678901234567',
      'Connecting to mongodb://admin:SuperSecretPassword999@cluster0.mongodb.net/prod',
      'Deploying with AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      '##[error] Process failed with exit code 1'
    ].join('\n');

    const parsed = parseAndCleanLog(sensitiveLog);

    // Verify cleanedLines is sanitized
    assert.strictEqual(parsed.cleanedLines.some((l) => l.text.includes('ghp_ABC')), false);
    assert.strictEqual(parsed.cleanedLines.some((l) => l.text.includes('SuperSecretPassword999')), false);
    assert.strictEqual(parsed.cleanedLines.some((l) => l.text.includes('AKIAIOSFODNN7EXAMPLE')), false);

    // CRITICAL SECURITY ASSERTION: ParsedLog.raw MUST ALSO be sanitized!
    assert.strictEqual(parsed.raw.includes('ghp_ABC'), false, 'ParsedLog.raw must NOT contain GitHub token');
    assert.strictEqual(parsed.raw.includes('SuperSecretPassword999'), false, 'ParsedLog.raw must NOT contain DB password');
    assert.strictEqual(parsed.raw.includes('AKIAIOSFODNN7EXAMPLE'), false, 'ParsedLog.raw must NOT contain AWS key');
    assert.ok(parsed.raw.includes('[REDACTED:github_token]'));
    assert.ok(parsed.raw.includes('[REDACTED:credentials]'));
    assert.ok(parsed.raw.includes('[REDACTED:aws_key]'));
  });

  test('extracts GitHub Actions step groups and failing step name', () => {
    const log = [
      '2026-10-31T01:00:00Z ##[group]Setup Node.js environment',
      '2026-10-31T01:00:01Z Node version v20.12.0',
      '2026-10-31T01:00:02Z ##[endgroup]',
      '2026-10-31T01:00:03Z ##[group]Run TypeScript Typecheck',
      '2026-10-31T01:00:04Z ##[error] src/index.ts: error TS2304: Cannot find name "foo"',
      '2026-10-31T01:00:05Z ##[endgroup]'
    ].join('\n');

    const parsed = parseAndCleanLog(log);
    assert.strictEqual(parsed.steps.length, 2);
    assert.strictEqual(parsed.steps[0].name, 'Setup Node.js environment');
    assert.strictEqual(parsed.steps[0].hasError, false);
    assert.strictEqual(parsed.steps[1].name, 'Run TypeScript Typecheck');
    assert.strictEqual(parsed.steps[1].hasError, true);
    assert.strictEqual(parsed.failingStepName, 'Run TypeScript Typecheck');
  });
});
