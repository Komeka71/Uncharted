export * from './types/index.js';
export * from './cleaner/index.js';
export * from './redactor/index.js';
export * from './rules/index.js';
export * from './fingerprint/index.js';
export * from './suspect/index.js';
export * from './flake/index.js';
export * from './parsers/index.js';
export * from './history/index.js';

import { parseAndCleanLog } from './cleaner/index.js';
import { evaluateRules } from './rules/engine.js';
import { generateFingerprint } from './fingerprint/index.js';
import { RuleMatch, FingerprintResult, ParsedLog } from './types/index.js';

export interface DeterministicAnalysisResult {
  parsedLog: ParsedLog;
  ruleMatch: RuleMatch;
  fingerprint: FingerprintResult;
  redactionCount: number;
  redactedTypes: Record<string, number>;
}

export function analyzeLogDeterministically(rawLog: string): DeterministicAnalysisResult {
  const parsedLog = parseAndCleanLog(rawLog);
  const ruleMatch = evaluateRules(parsedLog.cleanedLines);
  const fingerprint = generateFingerprint(ruleMatch);

  return {
    parsedLog,
    ruleMatch,
    fingerprint,
    redactionCount: parsedLog.redactions.count,
    redactedTypes: parsedLog.redactions.types
  };
}
