import { createHash } from 'node:crypto';
import { FingerprintResult, RuleMatch } from '../types/index.js';

export function normalizeVolatileTokens(text: string): string {
  let normalized = text;

  // 1. Replace workspace paths (/home/runner/work/... or /runner/... or C:\...)
  normalized = normalized.replace(/\/(?:home|Users)\/runner\/work\/[^\/]+\/[^\/\s:]+/gi, '<WORKSPACE>');
  normalized = normalized.replace(/[A-Za-z]:\\[^\s:]+\\workspace\\[^\s:]+/gi, '<WORKSPACE>');
  normalized = normalized.replace(/(?:\/[a-zA-Z0-9_\-\.]+)+/g, (match) => {
    // Keep file basenames, normalize directory trees
    const parts = match.split('/');
    const last = parts[parts.length - 1];
    if (last && last.includes('.')) {
      return `<PATH>/${last}`;
    }
    return match;
  });

  // 2. Remove ISO timestamps
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/gi, '<TIMESTAMP>');

  // 3. Remove durations (e.g. in 12.34s, 543ms)
  normalized = normalized.replace(/\b\d+(?:\.\d+)?\s*(?:ms|seconds?|secs?|s|minutes?|mins?|m)\b/gi, '<DURATION>');

  // 4. Remove memory addresses (e.g. 0x7fff5fbff820)
  normalized = normalized.replace(/0x[0-9a-fA-F]{6,16}/g, '<ADDR>');

  // 5. Remove Git SHAs (40 or 7-12 hex characters)
  normalized = normalized.replace(/\b[0-9a-f]{40}\b/gi, '<SHA>');
  normalized = normalized.replace(/\b[0-9a-f]{7,12}\b/gi, '<SHA_SHORT>');

  // 6. Remove UUIDs
  normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '<UUID>');

  // 7. Remove ephemeral PIDs and ports (e.g. PID 1234, port 54321)
  normalized = normalized.replace(/\bpid\s*[:=]?\s*\d+\b/gi, 'pid <PID>');
  normalized = normalized.replace(/\bport\s*[:=]?\s*\d+\b/gi, 'port <PORT>');

  // 8. Normalize line/col numbers inside stack traces (keep file name, strip specific line numbers if they fluctuate)
  normalized = normalized.replace(/:\d+:\d+/g, ':<LINE>:<COL>');

  // 9. Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

export function generateFingerprint(ruleMatch: RuleMatch): FingerprintResult {
  const primaryEvidence = ruleMatch.evidence.find((e) => e.role === 'primary') || ruleMatch.evidence[0];
  const primaryText = primaryEvidence ? primaryEvidence.text : ruleMatch.title;

  const normalizedPrimaryLine = normalizeVolatileTokens(primaryText);
  const canonicalMessage = `${ruleMatch.ruleId}|${normalizedPrimaryLine}|${ruleMatch.category}`;

  const signature = createHash('sha1').update(canonicalMessage).digest('hex').substring(0, 16);

  return {
    signature,
    normalizedPrimaryLine,
    canonicalMessage
  };
}
