import { RuleMatch } from '../types/index.js';
import { RULE_DEFINITIONS, RuleDefinition } from './ruleDefinitions.js';

function createUnknownMatch(lines: { lineNo: number; text: string }[]): RuleMatch {
  return {
    ruleId: 'unknown-failure',
    category: 'unknown',
    confidence: 0.3,
    evidence: lines.slice(-5).map((l) => ({ lineNo: l.lineNo, text: l.text, role: 'context' })),
    extracted: {},
    transient: false,
    title: 'Unclassified Build Failure',
    explanation: 'No specific signature matched known CI failure patterns. Inspect recent step output lines.',
    fixHints: [
      'Review the failing step log output for stack traces or error markers.',
      'Check if a sub-command terminated with a non-zero exit code.'
    ]
  };
}

/**
 * Evaluates all deterministic failure rules against cleaned log lines.
 *
 * Precedence Strategy:
 * 1. Specific rules always take precedence over fallback catch-alls (`generic-exit-code`).
 * 2. Higher confidence wins (e.g. 0.98 over 0.95).
 * 3. Specificity: rules that extracted structured root-cause entities (e.g. module names, error codes)
 *    outrank generic pattern matches.
 * 4. Evidence depth: rules with more verified primary evidence lines win.
 * 5. Deterministic tie-break based on canonical library order.
 */
export function evaluateRules(lines: { lineNo: number; text: string }[]): RuleMatch {
  if (!lines || lines.length === 0) {
    return createUnknownMatch([]);
  }

  const matches: RuleMatch[] = [];

  for (const def of RULE_DEFINITIONS) {
    const res = def.matcher(lines);
    if (res && res.matched) {
      matches.push({
        ruleId: def.id,
        category: def.category,
        confidence: res.confidence,
        evidence: res.evidence,
        extracted: res.extracted,
        transient: def.transient,
        title: def.title,
        explanation: def.explanation,
        fixHints: def.fixHints,
        suggestedPatch: def.suggestedPatch
      });
    }
  }

  if (matches.length === 0) {
    return createUnknownMatch(lines);
  }

  // Multi-tier deterministic precedence ranking
  matches.sort((a, b) => {
    // 1. Generic exit code is lowest tier
    if (a.ruleId === 'generic-exit-code' && b.ruleId !== 'generic-exit-code') return 1;
    if (b.ruleId === 'generic-exit-code' && a.ruleId !== 'generic-exit-code') return -1;

    // 2. Confidence difference (threshold > 0.001)
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 0.001) return confDiff;

    // 3. Extracted entities count (higher specificity)
    const aExtractedCount = Object.keys(a.extracted || {}).length;
    const bExtractedCount = Object.keys(b.extracted || {}).length;
    if (bExtractedCount !== aExtractedCount) return bExtractedCount - aExtractedCount;

    // 4. Primary evidence lines count
    const aPrimaryCount = a.evidence.filter((e) => e.role === 'primary').length;
    const bPrimaryCount = b.evidence.filter((e) => e.role === 'primary').length;
    if (bPrimaryCount !== aPrimaryCount) return bPrimaryCount - aPrimaryCount;

    return 0;
  });

  return matches[0];
}

