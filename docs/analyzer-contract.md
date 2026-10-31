# Culprit: Deterministic Failure Analyzer Contract

**Module Owner:** Person A (CI Ingestion, Cleaner, Redactor, Rules Engine, and Fingerprinting)  
**Consumer Modules:**  
- **Person B:** Historical Intelligence & MongoDB Analytics (`packages/core/src/history/**`, `apps/api/src/history/**`)  
- **Person C:** Agent Orchestrator & LLM Pipeline (`apps/api/src/services/agentOrchestrator.ts`, `apps/api/src/services/gemini.ts`)  
**Branch:** `person-a/ci-analyzer-fixes`

---

## 1. Overview & Architectural Role

Person A provides the security boundary, log normalization, and deterministic classification layer for Culprit.
Before any data reaches MongoDB or an LLM:
1. **Secrets are scrubbed** (GitHub PATs, AWS keys, Google API keys, DB URIs, Basic/Bearer auth, private keys).
2. **Terminal noise and ANSI escape codes are stripped** while strictly preserving 1-indexed original line numbers.
3. **Logs are classified against 26 failure rules** using a multi-tier deterministic precedence strategy.
4. **Stable 16-hex fingerprints are computed** by normalizing volatile tokens (runner paths, timestamps, PIDs, durations, memory addresses).

---

## 2. Core Output Types

All types are exported from `@culprit/core` (`packages/core/src/index.ts` and `packages/core/src/types/index.ts`).

### 2.1 DeterministicAnalysisResult
The primary output of `analyzeLogDeterministically(rawLog: string)`:

```typescript
export interface DeterministicAnalysisResult {
  parsedLog: ParsedLog;
  ruleMatch: RuleMatch;
  fingerprint: FingerprintResult;
  redactionCount: number;
  redactedTypes: Record<string, number>;
}
```

### 2.2 ParsedLog
```typescript
export interface ParsedLog {
  raw: string; // GUARANTEE: Redacted and sanitized before downstream handoff
  cleanedLines: { lineNo: number; text: string }[];
  steps: {
    name: string;
    hasError: boolean;
    lines: { lineNo: number; text: string }[];
  }[];
  failingStepName?: string;
  redactions: {
    count: number;
    types: Record<string, number>;
  };
  windowedLines: { lineNo: number; text: string }[];
}
```

### 2.3 RuleMatch
```typescript
export interface RuleMatch {
  ruleId: string;
  category: FailureCategory;
  confidence: number;
  evidence: EvidenceLine[];
  extracted: Record<string, string | number>;
  transient: boolean;
  title: string;
  explanation: string;
  fixHints: string[];
  suggestedPatch?: string;
}

export interface EvidenceLine {
  lineNo: number;
  text: string;
  role: 'primary' | 'context';
}
```

### 2.4 FingerprintResult
```typescript
export interface FingerprintResult {
  signature: string;             // Exactly 16 hex characters (sha1)
  normalizedPrimaryLine: string; // Volatile tokens replaced with <TOKEN>
  canonicalMessage: string;      // `${ruleId}|${normalizedPrimaryLine}|${category}`
}
```

---

## 3. Failure Categories (11 Enumerated Types)

Defined in `FailureCategorySchema`:
1. `dependency`: Missing packages, npm lockfile out of sync, resolution conflicts.
2. `build_compile`: TypeScript errors, Java javac errors, Go compilation failures.
3. `test_failure`: Jest assertions, PyTest failures, test timeouts.
4. `lint_format`: ESLint errors, Prettier formatting discrepancies.
5. `config_env`: Missing environment variables, invalid YAML workflow syntax.
6. `permissions_secrets`: GitHub Actions permission denied (GHA GITHUB_TOKEN write access).
7. `docker_container`: Docker build failures, Docker Hub pull rate limit (transient).
8. `infra_runner`: Disk full (transient), OOM heap exhausted, port in use.
9. `network_transient`: Network connection reset by peer, ETIMEDOUT (transient).
10. `timeout`: Step or job timeout (transient).
11. `unknown`: Fallback when no pattern matches (confidence = 0.3).

---

## 4. Consumer Integration Contracts

### 4.1 For Person B (Historical Intelligence & MongoDB Analytics)

Person B consumes the failure signature and category to track occurrences, calculate MTTR, and maintain signature state:

| Field | Source | Purpose for Person B |
|---|---|---|
| `signature` | `result.fingerprint.signature` | Unique key in `signatures` and `failures` collections (16 hex chars) |
| `category` | `result.ruleMatch.category` | Category trends aggregation and suspect commit rule weighting |
| `evidence` | `result.ruleMatch.evidence` | File path extraction for suspect commit ranking |
| `transient` | `result.ruleMatch.transient` | Indicator for flakiness vs infrastructure failure |

**Example Consumption in Person B:**
```typescript
import { analyzeLogDeterministically } from '@culprit/core';

const { ruleMatch, fingerprint } = analyzeLogDeterministically(rawLog);

// Ingest into MongoDB:
await recordFailureOccurrence(db, {
  projectId,
  signature: fingerprint.signature,
  category: ruleMatch.category,
  ruleId: ruleMatch.ruleId,
  runId,
  headSha
});
```

### 4.2 For Person C (LLM Investigator & Triage Agent)

Person C consumes sanitized diagnostic evidence and lines to prompt the Gemini LLM without sending unredacted secrets or raw terminal noise:

| Field | Source | Purpose for Person C |
|---|---|---|
| `parsedLog.raw` | `result.parsedLog.raw` | Guaranteed clean log text without unredacted secrets |
| `windowedLines` | `result.parsedLog.windowedLines` | Bounded context for token-limited LLM prompts (head + error + tail) |
| `ruleMatch.explanation` | `result.ruleMatch.explanation` | Baseline root-cause explanation for Triage Agent step |
| `ruleMatch.fixHints` | `result.ruleMatch.fixHints` | Actionable fix recommendations for Fix Advisor Agent |
| `ruleMatch.evidence` | `result.ruleMatch.evidence` | Grounded primary line citations (`lineNo`) for UI display |

---

## 5. Security & Redaction Guarantees

1. **Zero Credential Leakage:** All secrets matching GitHub PATs (classic & fine-grained), AWS keys, Google API keys, Slack tokens, JWTs, Bearer tokens, Basic Auth headers, Redis connection strings (including empty username), and private keys are replaced with `[REDACTED:<type>]`.
2. **Strict Line Preservation:** 1:1 original line count is preserved across all cleaning and redaction steps. If a log has 500 lines, `parsedLog.cleanedLines` has 500 lines, ensuring line citations match developers' editors.
3. **Precedence Determinism:** Specific rules always beat catch-alls (`generic-exit-code`). Higher confidence, structured extracted entities, and primary evidence lines break ties deterministically.
