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
    const raw = readFileSync(fixturePath, 'utf8');
    const originalLineCount = raw.split(/\r?\n/).length;

    const res = redactSecrets(raw);

    // Line count must be strictly preserved
    assert.strictEqual(res.lines.length, originalLineCount, 'Line count must match original');

    // Secrets must be redacted
    assert.strictEqual(res.cleanedText.includes('SuperSecretPassword123'), false, 'Password must not appear');
    assert.strictEqual(res.cleanedText.includes('AKIAIOSFODNN7EXAMPLE'), false, 'AWS key must not appear');
    assert.strictEqual(res.cleanedText.includes('ghp_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8'), false, 'GitHub token must not appear');
    assert.strictEqual(res.cleanedText.includes('AIzaSyD9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j4i'), false, 'Google API key must not appear');
    assert.strictEqual(res.cleanedText.includes('BEGIN RSA PRIVATE KEY'), false, 'Private key header must not appear');

    // Redaction count must be positive
    assert.ok(res.redactionCount >= 6, `Expected at least 6 redactions, got ${res.redactionCount}`);
    assert.ok(res.redactedTypes['connection_string_credentials'] >= 1);
    assert.ok(res.redactedTypes['aws_key'] >= 1);
    assert.ok(res.redactedTypes['github_token'] >= 1);
    assert.ok(res.redactedTypes['google_api_key'] >= 1);
  });
});
