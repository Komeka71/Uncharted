import { RuleMatch } from '../types/index.js';
import { RULE_DEFINITIONS, RuleDefinition } from './ruleDefinitions.js';

export function evaluateRules(lines: { lineNo: number; text: string }[]): RuleMatch {
  let bestMatch: RuleMatch | null = null;

  for (const def of RULE_DEFINITIONS) {
    const res = def.matcher(lines);
    if (res && res.matched) {
      const match: RuleMatch = {
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
      };

      // If we find a specific high-confidence match (not the generic exit code), keep the highest confidence
      if (!bestMatch || (match.ruleId !== 'generic-exit-code' && (bestMatch.ruleId === 'generic-exit-code' || match.confidence > bestMatch.confidence))) {
        bestMatch = match;
        if (match.confidence >= 0.95 && match.ruleId !== 'generic-exit-code') {
          // Found high-confidence deterministic match, can return early
          return bestMatch;
        }
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  // Fallback if no rules matched at all
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
