# Culprit: Historical Intelligence and MongoDB Analytics Contract

**Module Owner:** Person B (Historical Intelligence & MongoDB Analytics)  
**Branch:** `feat/person-b-history`  
**Status:** Complete, tested, and verified.

---

## 1. Executive Summary

This document specifies the interface contract between Person B's module and the rest of the Culprit platform:
1. **Person C (Agentic Orchestrator & Historian Agent):** Consumes `buildHistoricalContext(...)` and `HistoricalContext` to supply grounded intelligence to the LLM without hallucinated statistics or mock numbers.
2. **Person A (Ingestion & GitHub Services):** Provides commit diff file lists and triggers `recordFailureOccurrence` upon ingesting workflow failures.
3. **Frontend (Dashboard & Analytics Views):** Receives honest, unpadded metrics from `/api/stats/overview`, `/api/flaky`, and `/api/signatures/:signature/history`.

---

## 2. HistoricalContext Schema Contract

The `HistoricalContext` is the single source of truth for all historical intelligence. It is defined in `@culprit/core` (`packages/core/src/history/types.ts`) and validated via Zod (`HistoricalContextSchema`).

```typescript
export interface HistoricalContext {
  runId: string;
  projectId: string;
  signature: string;
  historicalOccurrences: number;
  isFirstOccurrence: boolean;
  firstSeenAt?: string;             // ISO-8601
  lastSeenAt?: string;              // ISO-8601
  status: 'open' | 'resolved' | 'regressed';
  isRegression: boolean;
  regressionCount: number;
  previousOccurrences: PreviousOccurrence[];
  knownFix?: KnownFixRecord;
  suspectCommits: {
    status: 'ranked' | 'no_match' | 'insufficient_data' | 'not_requested';
    commits: SuspectCommit[];
    baseSha?: string;
    headSha?: string;
    notes: string[];
  };
  flaky: {
    status: 'FLAKY' | 'BROKEN' | 'WATCH' | 'STABLE' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';
    tests: FlakyTestSummary[];
  };
  dataQuality: {
    dbAvailable: boolean;
    notes: string[];
  };
}
```

### Sub-type Specifications

#### PreviousOccurrence
```typescript
export interface PreviousOccurrence {
  failureId?: string;
  runId: string;
  branch?: string;
  headSha?: string;
  at: string; // ISO-8601 timestamp
}
```

#### KnownFixRecord
```typescript
export interface KnownFixRecord {
  note: string;
  commitSha?: string;
  author?: string;
  fixedAt: string; // ISO-8601
  verificationStatus: 'unverified' | 'verified' | 'ineffective';
  verifiedAt?: string;
  verifiedByRunId?: string;
}
```

#### FlakyTestSummary
```typescript
export interface FlakyTestSummary {
  testId: string;
  verdict: 'flaky' | 'broken' | 'watch' | 'stable';
  evidence: 'sufficient' | 'insufficient';
  executions: number;
  flakeRate: number;
  sameShaFlips: number;
}
```

---

## 3. Definitions & Core Rules

### 3.1 Failure Occurrence (Idempotency)
- An **Occurrence** is an instance of a failure with signature $S$ occurring in a unique CI run.
- **Idempotency Guarantee:** If the same `runId` is analyzed multiple times (e.g., retried webhooks, re-investigations), `occurrences` is NOT incremented. It only increments when a distinct `runId` fails with the same signature.

### 3.2 Scope & Resolution
- **Scope:** Defined by `(projectId, workflow, branch)`.
- **Resolved:** A signature transitions from `'open'` or `'regressed'` to `'resolved'` when a CI run in the same scope succeeds (`conclusion: 'success'`) after the failure's timestamp.
- **Regression:** A signature transitions to `'regressed'` if it was previously marked `'resolved'`, but fails again on a subsequent run.

### 3.3 Known Fix State Machine
- When a developer registers a known fix note via `POST /api/signatures/:signature/known-fix`, it is recorded as `verificationStatus: 'unverified'`. It does **not** immediately resolve the signature.
- **Transitions:**
  - `unverified` $\rightarrow$ `verified`: A subsequent run in the scope succeeds after `fixedAt`.
  - `unverified` $\rightarrow$ `ineffective`: The same signature recurs in a subsequent run after `fixedAt` without any intervening successful run.

### 3.4 Flake Math Engine Rubric
Evaluated over up to the last 30 non-skipped executions per test:
1. **Insufficient Sample (`executions < 5`):**
   - If failures present: verdict = `'watch'`, `evidence = 'insufficient'`.
   - If no failures: verdict = `'stable'`, `evidence = 'insufficient'`.
2. **Sufficient Sample (`executions >= 5`):**
   - `0 failures`: verdict = `'stable'`.
   - `100% failures`: verdict = `'broken'`.
   - `Mixed outcomes`:
     - If $\ge 1$ same-SHA flip (passed and failed on identical commit) OR $\ge 3$ outcome flips: verdict = `'flaky'`.
     - Else if recent 3 executions failed and flips $\le 2$: verdict = `'broken'` (recent regression).
     - Else (isolated failures across distinct commits with $<3$ flips): verdict = `'watch'`.

### 3.5 Suspect Commit Ranking
- **Ordering:** GitHub compare API returns commits **oldest first** (`[oldest, ..., newest]`).
- **Scoring Rubric:**
  - `+3.0`: Commit directly modified a file explicitly mentioned in the failure trace.
  - `+2.0`: Commit modified dependency manifest/lockfile (`package.json`, `package-lock.json`, etc.) under `category: 'dependency'`.
  - `+2.0`: Commit modified CI workflow, Dockerfile, or container config under `config_env` or `docker_container`.
  - `+1.0`: Commit modified related source files in the same directory (requires $\ge 2$ path segments, preventing bare `"src"` false positives).
  - Tie-breaker: Recency bonus `(idx + 1) * 0.02` (newer commits in the push break ties among commits that earned evidence-based points). Unrelated commits with 0 evidence match score 0.
- **Empty Diffs:** If commit diffs contain no file paths (common when GitHub Actions compare payload omits per-commit file details), Culprit returns `status: 'insufficient_data'` with 0 suspects rather than inventing random guesses.

---

## 4. MongoDB Database Indexes

All indexes are created with prefix `hist_`, idempotent memoization, and conflict recovery:

| Collection | Index Spec | Name | Purpose |
|---|---|---|---|
| `signatures` | `{ projectId: 1, signature: 1 }` (unique) | `hist_signatures_project_signature` | Fast lookup of signature state & occurrences |
| `signatures` | `{ projectId: 1, status: 1, lastSeen: -1 }` | `hist_signatures_project_status_lastseen` | Active failure monitoring & reconciliation |
| `failures` | `{ projectId: 1, signature: 1, createdAt: -1 }` | `hist_failures_project_sig_created` | Timeline reconstruction & occurrence list |
| `failures` | `{ projectId: 1, createdAt: -1 }` | `hist_failures_project_created` | Recurring rate & category trend analytics |
| `runs` | `{ projectId: 1, branch: 1, conclusion: 1, completedAt: -1 }` | `hist_runs_project_branch_conclusion_completed` | Green run detection & signature reconciliation |
| `runs` | `{ projectId: 1, headSha: 1 }` | `hist_runs_project_headsha` | Commit baseline resolution |
| `known_fixes` | `{ projectId: 1, signature: 1, fixedAt: -1 }` | `hist_knownfixes_project_sig_fixed` | Known fix audit log & verification checks |
| `testResults` | `{ projectId: 1, testId: 1, ts: -1 }` | `hist_testresults_project_testid_ts` | Flaky test window calculation |

---

## 5. Handoff Requests & Integration Snippets

### 5.1 For Person C (LLM Orchestrator & Historian Agent)

In `apps/api/src/services/agentOrchestrator.ts`, replace the inline mock Historian step with this drop-in snippet:

```typescript
// --- PERSON C INTEGRATION SNIPPET ---
import { buildHistoricalContext } from '../history/index.js';
import { getDb, isDbConnected } from '../db/client.js';

// Inside your agent pipeline / historian step:
const db = isDbConnected() ? getDb() : null;

const historicalContext = await buildHistoricalContext(db, {
  projectId: input.projectId,
  signature: fingerprint.signature,
  currentRunId: input.runId,
  currentSha: input.headSha,
  scope: input.branch,
  workflowName: input.workflow
});

// Pass historicalContext directly to your LLM system prompt:
// `Historical Context: ${JSON.stringify(historicalContext, null, 2)}`
```

### 5.2 For Person A (GitHub Ingestion Service)

In `apps/api/src/services/github.ts`:
When GitHub compare REST endpoint (`/repos/{owner}/{repo}/compare/{base}...{head}`) returns commit summaries with empty `files: []`, consider fetching individual commit file diffs for up to 5 commits:
```typescript
// Recommended enhancement if compare omits files:
if (commits.length > 0 && commits.every((c) => !c.files || c.files.length === 0)) {
  for (const c of commits.slice(0, 5)) {
    const detail = await octokit.rest.repos.getCommit({ owner, repo, ref: c.sha });
    c.files = (detail.data.files || []).map((f) => f.filename);
  }
}
```

### 5.3 For Frontend & Dashboard Engineers

1. **Empty States:** When the database is fresh, `/api/stats/overview` returns honest zeros:
   ```json
   {
     "kpis": {
       "totalFailures7d": 0,
       "recurringRatePct": 0,
       "flakyTestsCount": 0,
       "mttrHours": 0
     },
     "topRecurring": [],
     "categoryTrends": [],
     "flakyCount": 0,
     "isDemoData": false
   }
   ```
   The UI should display clean empty states ("No failures detected in the last 7 days", "All test suites stable") rather than breaking.
2. **Offline Fallback Flag:** When the database is disconnected, responses include `"isDemoData": true` so the UI can optionally display a subtle "Demo Mode / Offline Data" badge.

### 5.4 For Demo Data & Seed Scripts

To showcase **Resolution** and **MTTR** in live hackathon demos:
- Seed a failure run at $T_0$.
- Seed a successful run (`conclusion: 'success'`) on the same branch at $T_0 + 2\text{ hours}$.
- Running `/api/stats/overview` will demonstrate Culprit automatically resolving the failure and computing an MTTR of `2.0h` without hardcoding!
