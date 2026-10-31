# Origin: Deterministic Failure Analyzer Contract

**Module Owner:** Person A (CI Ingestion, Cleaner, Redactor, Rules Engine, and Fingerprinting)  
**Consumer Modules:**  
- **Person B:** Historical Intelligence & MongoDB Analytics (`packages/core/src/history/**`, `apps/api/src/history/**`)  
- **Person C:** Agent Orchestrator & LLM Pipeline (`apps/api/src/services/agentOrchestrator.ts`, `apps/api/src/services/gemini.ts`)  
**Branch:** `person-a/ci-analyzer-fixes`

---

## 1. Overview & Architectural Role

Person A provides the security boundary, log normalization, and deterministic classification layer for Origin.
Before any data reaches MongoDB or an LLM:
1. **Secrets are scrubbed** (GitHub PATs, AWS keys, Google API keys, DB URIs, Basic/Bearer auth, private keys).
2. **Terminal noise and ANSI escape codes are stripped** while strictly preserving 1-indexed original line numbers.
3. **Logs are classified against 26 failure rules** using a multi-tier deterministic precedence strategy.
4. **Stable 16-hex fingerprints are computed** by normalizing volatile tokens (runner paths, timestamps, PIDs, durations, memory addresses).

---

## 2. Core Output Types

All types are exported from `@origin/core` (`packages/core/src/index.ts` and `packages/core/src/types/index.ts`).

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
3. `test_failure`: Jest assertions, Vitest failures, PyTest failures, test timeouts.
4. `lint_format`: ESLint errors, Prettier formatting discrepancies.
5. `config_env`: Missing environment variables, invalid YAML workflow syntax.
6. `permissions_secrets`: GitHub Actions permission denied (GHA GITHUB_TOKEN write access).
7. `docker_container`: Docker build failures, Docker Hub pull rate limit (transient).
8. `infra_runner`: Disk full (transient), OOM heap exhausted, port in use.
9. `network_transient`: Network connection reset by peer, ETIMEDOUT (transient).
10. `timeout`: Step or job timeout (transient).
11. `unknown`: Fallback when no pattern matches (confidence = 0.3).

### 3.1 Recent Deterministic Rule Enhancements

1. **`vitest-failure` (`test_failure`, confidence: 0.93):**
   - Matches modern Vitest failure patterns: `FAIL <file> > <suite> > <test>`, `AssertionError: expected <actual> to be <expected>`, `Tests <N> failed | <M> passed`.
   - Extracts failing test name, source file, expected/actual expressions.
2. **`npm-lock-out-of-sync` (`dependency`, confidence: 0.98):**
   - Loosened matcher to support modern and legacy npm formats: `` `npm ci` ``, `npm ci` without backticks, `or npm-shrinkwrap.json`, and `npm error Missing: <pkg> from lock file`.
3. **`network-reset` (`network_transient`, confidence: 0.95):**
   - Confidence elevated to `0.95` to outrank generic test runner assertions (`0.93`) when test failures are triggered by transient socket hang-ups or TCP resets.
4. **`env-var-missing` (`config_env`, confidence: 0.94):**
   - Extracted entity regex captures the exact missing variable name (e.g., `API_URL`, `TOKEN`, `DATABASE_URL`) from modern framework errors.

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
import { analyzeLogDeterministically } from '@origin/core';

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

---

## 6. Background Queue Workers & Jobs

Background job execution is powered by `apps/api/src/services/jobQueue.ts` and `apps/api/src/services/runProcessor.ts`:

### 6.1 `process_workflow_run` Job
- **Payload:** `{ runId, projectId, repo: { owner, name }, conclusion, logUrl, headSha, branch }`
- **Execution:**
  1. Downloads raw workflow log via authenticated GitHub API or URL.
  2. Runs `analyzeLogDeterministically`.
  3. Records failure occurrences and links historical signatures in MongoDB.
  4. Broadcasts realtime `diagnosis_ready` event via SSE to connected dashboards.

### 6.2 `sync_project_runs` Job
- **Payload:** `{ projectId, branch?, maxRuns? }`
- **Execution:**
  1. Queries GitHub REST API (`GET /repos/{owner}/{repo}/actions/runs`) for the latest completed workflow runs (default up to 20).
  2. Inspects MongoDB `runs` collection to identify un-ingested runs.
  3. Automatically enqueues individual `process_workflow_run` jobs for each missing run.

---

## 7. Ingestion Hardening, Idempotency, and Rate Limiting

### 7.1 Ingestion Hardening
- **Authentication:** `POST /api/ingest/:projectId` enforces `Authorization: Bearer <ingestToken>` whenever the target project defines an `ingestToken`.
- **Project Validation:** Returns `404 { error: { code: 'PROJECT_NOT_FOUND' } }` when connected to MongoDB and the specified project does not exist.
- **Malformed Input:** Returns `400 { error: { code: 'MALFORMED_TEST_RESULTS' } }` if test result payloads cannot be parsed according to the specified format.

### 7.2 Idempotency
- Incoming runs are assigned an event fingerprint: `sha256(generic:${projectId}:${externalId})`.
- The event is recorded in the `ingestEvents` collection. Duplicate events immediately return `200 { duplicate: true, success: true }` without re-running CPU-intensive parsing or inflating failure occurrence counts.

### 7.3 Rate Limiting Middleware
Defined in `apps/api/src/middleware/rateLimit.ts` using an in-memory sliding window:
- `/api/analyze`: 20 requests / min (protects LLM and CPU parser)
- `/api/ingest`: 60 requests / min (accommodates high-throughput CI webhooks and runners)
- `/api/webhooks`: 120 requests / min (handles burst GitHub webhook deliveries)
- **Health Exemption:** `/health` and `/ready` bypass rate limiting to guarantee container orchestrator liveness probes never flap.
- **Proxy Support:** Accurately identifies client IP via standard `X-Forwarded-For` headers.

