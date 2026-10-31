import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSecrets } from '../src/redactor/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Secret Redactor', () => {
  test('redacts all token types and connection strings from secrets_in_log.log', () => {
    const fixturePath = join(__dirname, '../fixtures/secrets_in_log.log');
    // const raw = readFileSync(fixturePath, 'utf8');
    const googleApiKey = 'AIza' + 'A'.repeat(35);
    const raw = readFileSync(fixturePath, 'utf8')
      .replace('GOOGLE_API_KEY_TEST_PLACEHOLDER', googleApiKey);
    const originalLineCount = raw.split(/\r?\n/).length;
    const res = redactSecrets(raw);

    // Line count must be strictly preserved
    assert.strictEqual(res.lines.length, originalLineCount, 'Line count must match original');

    // Secrets must be redacted
    assert.strictEqual(res.cleanedText.includes('SuperSecretPassword123'), false, 'Password must not appear');
    assert.strictEqual(res.cleanedText.includes('AKIAIOSFODNN7EXAMPLE'), false, 'AWS key must not appear');

    assert.strictEqual(res.cleanedText.includes('ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8'), false, 'GitHub token must not appear');
    assert.strictEqual(res.cleanedText.includes(googleApiKey), false, 'Google API key must not appear');
    //assert.strictEqual(res.cleanedText.includes('GOOGLE_API_KEY_TEST_PLACEHOLDER'), false, 'Google API key must not appear');
    // assert.strictEqual(res.cleanedText.includes('AIzaSyD9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j4i'), false, 'Google API key must not appear');
    assert.strictEqual(res.cleanedText.includes('BEGIN RSA PRIVATE KEY'), false, 'Private key header must not appear');

    // Redaction count must be positive
    assert.ok(res.redactionCount >= 6, `Expected at least 6 redactions, got ${res.redactionCount}`);
    assert.ok(res.redactedTypes['connection_string_credentials'] >= 1);
    assert.ok(res.redactedTypes['aws_key'] >= 1);
    assert.ok(res.redactedTypes['github_token'] >= 1);
    assert.ok(res.redactedTypes['google_api_key'] >= 1);
  });

  test('redacts Redis connection strings with empty username', () => {
    const log = 'redis-cli -u redis://:my_super_redis_pass@127.0.0.1:6379/0 ping';
    const res = redactSecrets(log);
    assert.strictEqual(res.cleanedText.includes('my_super_redis_pass'), false);
    assert.ok(res.cleanedText.includes('redis://[REDACTED:credentials]@127.0.0.1:6379/0'));
    assert.strictEqual(res.redactionCount, 1);
  });

  test('redacts Basic Auth and Bearer headers', () => {
    const log = [
      'curl -H "Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=" https://api.internal/v1',
      'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisTokenSignature" https://api.internal/v2'
    ].join('\n');

    const res = redactSecrets(log);
    assert.strictEqual(res.cleanedText.includes('dXNlcm5hbWU6cGFzc3dvcmQ='), false);
    assert.strictEqual(res.cleanedText.includes('doNotLeakThisTokenSignature'), false);
    assert.ok(res.cleanedText.includes('[REDACTED:basic_auth]'));
    assert.ok(res.cleanedText.includes('[REDACTED:bearer_token]'));
  });

  test('redacts GitHub fine-grained PATs', () => {
    const pat = 'github_pat_11AAAAAAA0123456789012345678901234567890123456789012345678901234567890123456789012';
    const log = `export GITHUB_TOKEN=${pat}`;
    const res = redactSecrets(log);
    assert.strictEqual(res.cleanedText.includes(pat), false);
    assert.ok(res.cleanedText.includes('[REDACTED:github_fine_grained_pat]'));
  });

  test('redacts multiple distinct secrets on a single line', () => {
    const googleApiKey = 'AIza' + 'B'.repeat(35);
    const line = `curl -u AKIAIOSFODNN7EXAMPLE:password12345 https://maps.googleapis.com?key=${googleApiKey}`;
    const res = redactSecrets(line);

    assert.strictEqual(res.cleanedText.includes('AKIAIOSFODNN7EXAMPLE'), false);
    assert.strictEqual(res.cleanedText.includes('password12345'), false);
    assert.strictEqual(res.cleanedText.includes(googleApiKey), false);
    assert.ok(res.redactionCount >= 3, 'Must detect at least 3 secrets on the same line');
  });

  test('preserves exact line count during multiline private key redaction', () => {
    const log = [
      'Step 1: Setup SSH keys',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Y1+...',
      'abcdef1234567890...',
      '-----END RSA PRIVATE KEY-----',
      'Step 2: Key verified'
    ].join('\n');

    const res = redactSecrets(log);
    assert.strictEqual(res.lines.length, 6, 'Must preserve exact 6 line count');
    assert.strictEqual(res.cleanedText.includes('MIIEowIBAAKCAQEA0Y1+'), false);
    assert.strictEqual(res.cleanedText.includes('BEGIN RSA PRIVATE KEY'), false);
    assert.strictEqual(res.lines[0], 'Step 1: Setup SSH keys');
    assert.strictEqual(res.lines[5], 'Step 2: Key verified');
  });

  test('handles empty or malformed inputs cleanly', () => {
    const emptyRes = redactSecrets('');
    assert.strictEqual(emptyRes.cleanedText, '');
    assert.strictEqual(emptyRes.redactionCount, 0);

    const nullRes = redactSecrets(null as any);
    assert.strictEqual(nullRes.cleanedText, '');
    assert.strictEqual(nullRes.redactionCount, 0);
  });
});

