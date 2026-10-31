# Culprit Architecture & Technical Specification

> **Event:** UNCHARTED 2026 (Track 3: Developer Tools for Production Use Cases)  
> **System:** Culprit — Autonomous Agentic CI Failure Investigator  

---

## 1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Ingestion["Ingestion Layer"]
        A1[GitHub Webhook / workflow_run] --> Ingest[Event Ingestion & Deduplication]
        A2[Generic CI cURL Ingest] --> Ingest
        A3[Instant Log Paste / Drop] --> Analyzer[Direct Analysis Pipeline]
    end

    subgraph Persistence["MongoDB Persistence Layer"]
        Ingest --> Dedupe{Check Event SHA256}
        Dedupe -- New --> JobQ[(jobQueue Collection)]
        Dedupe -- Replay --> DupReturn[Return 200 duplicate:true]
        
        JobQ --> Worker[In-Process Job Queue Worker]
    end

    subgraph AgenticPipeline["6-Stage Agentic Pipeline"]
        Worker --> S1[1. Collector Agent]
        Analyzer --> S1
        S1 --> S2[2. Triage Agent - Deterministic Core Engine]
        S2 --> S3[3. Historian Agent - MongoDB Memory]
        S3 --> S4[4. Investigator Agent - Gemini LLM with Tools]
        S4 --> S5[5. Fix Advisor Agent - Patch & Verification]
        S5 --> S6[6. Reporter Agent - SSE & Diagnosis]
    end

    subgraph Storage["MongoDB Collections"]
        S2 --> CollRedact[Redacted Logs & Signatures]
        S3 <--> CollSig[(signatures)]
        S4 <--> Tools[LLM Tool Calls & Validations]
        S6 --> CollDiag[(diagnoses)]
        S6 --> CollSteps[(agentSteps)]
        S6 --> SSE[Server-Sent Events /api/stream]
    end

    subgraph UI["Next.js Web Client"]
        SSE --> LiveDash[Dashboard /app]
        CollDiag --> HeroDetail[Failure Detail /app/failures/:id]
        CollSig --> FlakyPage[Flaky Tests /app/flaky]
    end
```

---

## 2. Ingestion & Idempotency Guarantee

### 2.1 Webhook Processing & Timing
- GitHub Webhooks (`POST /api/webhooks/github`) verify the `X-Hub-Signature-256` header using HMAC-SHA256 with constant-time equality checks (`crypto.timingSafeEqual`).
- The endpoint completes within **150ms**, returning an HTTP `202 Accepted` response with an `eventId`.
- Heavy log retrieval and agent analysis run asynchronously via the atomic MongoDB job queue.

### 2.2 Strict Replay Protection
- Every incoming event generates a deterministic hash:
  $$\text{eventId} = \text{sha256}(\text{source} + \text{repoId} + \text{runId} + \text{runAttempt} + \text{eventType} + \text{action})$$
- Stored in the `ingestEvents` collection protected by a **unique index** on `eventId`.
- Any replay attack or network retry triggers an immediate duplicate response: `{ duplicate: true, message: "Event already processed" }`, completely avoiding redundant LLM usage or database writes.

---

## 3. Deterministic Analysis Engine (`packages/core`)

Culprit follows a strict architectural principle: **Deterministic first, LLM second.**

### 3.1 Cleaning & Secret Redaction
- Strips ANSI terminal color codes and extracts GitHub Actions step groups (`##[group]`, `##[error]`, `##[warning]`).
- Redacts sensitive credentials **before storage and before sending to any LLM**:
  - GitHub PATs (`ghp_`, `github_pat_`, etc.)
  - AWS access keys (`AKIA...`)
  - Google API keys (`AIza...`)
  - JWT tokens
  - Bearer headers
  - Database connection strings with credentials (`mongodb+srv://user:pass@...`)
  - Multi-line RSA/EC private key blocks
- Replaces secrets with typed markers `[REDACTED:<type>]` while strictly preserving line count 1:1 so evidence line citations remain accurate.

### 3.2 26+ Rule Library Across 11 Categories
1. **Dependency:** `npm-lock-out-of-sync`, `npm-module-not-found`, `npm-eresolve`, `npm-404-registry`, `pip-module-not-found`, `pip-resolution`, `maven-dep-resolve`.
2. **Build/Compile:** `ts-compile-error` (captures file, line, TS error code), `java-compile-error`, `go-build-error`.
3. **Lint/Format:** `eslint-failure`, `prettier-check`.
4. **Test Failures:** `test-timeout` (transient indicator), `jest-assertion`, `pytest-failure`.
5. **Config/Env:** `env-var-missing`, `workflow-yaml-invalid`.
6. **Permissions/Secrets:** `gh-permission-denied`.
7. **Docker/Container:** `docker-pull-rate-limit` (transient), `docker-build-fail`.
8. **Infra/Runner:** `disk-full` (transient), `oom`, `port-in-use`.
9. **Network:** `network-reset` (transient).
10. **Timeout:** `job-timeout`.
11. **Unknown/Fallback:** `generic-exit-code`.

### 3.3 Stable Fingerprinting
Normalizes volatile tokens (ISO timestamps, durations, PIDs, ephemeral ports, runner paths like `/home/runner/work/repo/repo/` -> `<WORKSPACE>/`, and memory addresses) before computing:
$$\text{signature} = \text{sha1}(\text{ruleId} + "|" + \text{normalizedPrimaryLine} + "|" + \text{category})[0..16]$$
Guarantees identical failures across different runners, branches, or days produce identical 16-hex signatures.

---

## 4. Multi-Agent Pipeline & Zero-LLM Fallback

Every failure is investigated through 6 orchestrated stages:
1. **Collector Agent:** Downloads logs, jobs, and commit compare metadata.
2. **Triage Agent:** Runs the deterministic rule engine, strips ANSI, and redacts secrets.
3. **Historian Agent:** Queries MongoDB `signatures` collection to retrieve historical occurrence count, regression status, and previous known fixes.
4. **Investigator Agent (Google Gemini):** Receives redacted context window and investigates root cause using tool calling (`get_log_window`, `search_similar_failures`, `get_changed_files`, `get_flake_stats`). Strictly validates cited evidence line numbers.
5. **Fix Advisor Agent:** Formulates ordered remediation steps, verification commands (`verifyWith`), and unified diff patch suggestions.
6. **Reporter Agent:** Persists diagnosis into `diagnoses`, step trace into `agentSteps`, and broadcasts live SSE notifications.

### Zero-LLM Fallback Mode
If `GEMINI_API_KEY` is not provided, or if network timeouts or quota exhaustion occur, the engine instantly falls back to rule-derived root causes and remediation hints (`source: "rules"`). The application remains 100% operational under any circumstances.

---

## 5. MongoDB Data Model & Aggregations

### 5.1 Collections & Index Strategy
- `projects`: Unique `{ "repo.owner": 1, "repo.name": 1 }`, indexed on `ingestToken`.
- `runs`: Unique `{ projectId: 1, runId: 1 }`, indexed on `{ projectId: 1, startedAt: -1 }`.
- `failures`: Indexed on `{ projectId: 1, createdAt: -1 }`, `{ projectId: 1, signature: 1 }`, `{ runId: 1 }`.
- `signatures`: Unique `{ projectId: 1, signature: 1 }`, indexed on `{ projectId: 1, lastSeenAt: -1 }`.
- `testResults`: Unique `{ eventId: 1 }`, indexed on `{ projectId: 1, testId: 1, ts: -1 }`.
- `diagnoses`: Indexed on `{ failureId: 1, version: -1 }`.
- `agentSteps`: Indexed on `{ failureId: 1, seq: 1 }`.
- `logs`: Compound `{ runId: 1, jobName: 1, chunkIndex: 1 }`, **TTL index on `createdAt` (14 days)**.
- `ingestEvents`: Unique `{ eventId: 1 }`.
- `jobQueue`: Compound `{ status: 1, runAfter: 1 }`.

### 5.2 Aggregation Pipelines
- **A1 (Top Recurring Failures):** Matches by project and date window, groups by signature, and performs `$lookup` into `signatures` for known fixes.
- **A2 (Daily Trends by Category):** Groups errors by date and category to power Recharts visualization.
- **A3 (Mean Time to Resolution - MTTR):** Computes time elapsed between first failing run and subsequent green run on the same branch.
- **A4 (Flaky Test Analysis):** Evaluates a 30-run sliding window per test. Uses `$addToSet` of outcomes per `{ testId, headSha }` to identify **same-SHA flips** (commits that both passed and failed).
