# Culprit Judge Q&A Cheat Sheet (15 Key Questions)

> **Prepared for:** UNCHARTED 2026 Presentation & Round 1 Q&A  
> **Team:** Culprit Engineering Team

---

### Q1: Why did you build a deterministic rules engine first instead of sending the entire log directly to an LLM?
**Answer:** Deterministic first, LLM second is our core architectural tenet. LLMs can hallucinate, are expensive at scale, and often miss nuanced exit codes in 10,000-line logs. Our deterministic engine categorizes the failure across 26+ rules in less than 5ms with zero token cost. The LLM is only used where it truly shines: synthesizing plain-English explanations, connecting changed files, and proposing intelligent patches. If the LLM is down or rate-limited, Culprit still produces a grounded diagnosis.

---

### Q2: How do you prevent LLM hallucinations from misleading engineers?
**Answer:** We enforce two strict guardrails:
1. **Context Windowing & Redaction:** The LLM only receives an epicenter window around the failing step with strict 1-indexed line numbers.
2. **Evidence Citation Validation:** The server intercepts the LLM's response and verifies that every line cited in `evidenceLines` actually exists in the log and that any cited file exists in the commit diff. If the LLM hallucinates an invalid line, our server drops the citation and downgrades confidence.

---

### Q3: What prevents duplicate webhook deliveries from causing redundant analysis?
**Answer:** Strict idempotency at the database layer. Every incoming webhook generates a SHA-256 event ID:
`eventId = sha256(source + repoId + runId + runAttempt + eventType + action)`.
This is inserted into MongoDB's `ingestEvents` collection backed by a **unique index**. If GitHub replays the webhook, MongoDB rejects the duplicate insert with code 11000, and our API immediately returns `200 OK { duplicate: true }` without enqueueing or burning LLM quota.

---

### Q4: How is a test mathematically defined as "Flaky" vs "Broken"?
**Answer:** We analyze a 30-run sliding execution window:
- **Broken:** The test fails 100% of the time since a specific commit SHA (consistent failure indicates a genuine code regression).
- **Flaky:** The test has both passes and failures within the window **AND** has at least one **same-SHA flip** (the identical commit SHA passed on one attempt and failed on another) or 3+ outcome oscillations.
- **Watch:** Fewer than 5 historical executions (not enough statistical data).
- **Stable:** 100% pass rate in the window.

---

### Q5: How do you handle secrets that might be printed in CI logs?
**Answer:** Secrets are redacted **before storage in MongoDB and before any prompt is sent to Google Gemini**. Our regex redactor catches GitHub tokens (`ghp_`, `github_pat_`), AWS keys (`AKIA...`), Google API keys (`AIza...`), Slack tokens, JWTs, Bearer headers, and database connection strings with passwords. Redactions are replaced by `[REDACTED:<type>]` while strictly preserving 1-indexed line counts so citations remain accurate.

---

### Q6: How does Culprit rank "Suspect Commits"?
**Answer:** We inspect commits between the last green run and the failing run:
- **+3 points** if a commit touched a file path cited in the stack trace or failure evidence.
- **+2 points** for dependency failures if `package.json`, lockfiles, or `requirements.txt` changed.
- **+2 points** for config/docker failures if workflow YAMLs or Dockerfiles changed.
- **+1 point** if files in the same directory as the error changed.
- Small recency tie-breaker for the latest commit. Top 3 are returned with clear, explainable reasons.

---

### Q7: Why did you choose MongoDB over a relational database?
**Answer:**
1. **Flexible Failure Evidence:** CI log structures and test formats vary widely between JUnit, Jest, and raw stack traces. MongoDB handles these varied document shapes natively.
2. **Powerful Aggregations:** We implemented 4 complex aggregations (A1 top recurring, A2 daily category trends, A3 MTTR, A4 flaky same-SHA flips) in single optimized database queries.
3. **Change Streams for Real-Time SSE:** MongoDB change streams watch `failures` and push live updates directly to the connected frontend dashboard.
4. **TTL Indexes:** Automated 14-day log retention via `expireAfterSeconds` on the `logs` collection keeps database size predictable.

---

### Q8: What happens if MongoDB Atlas or the Gemini API is completely unreachable?
**Answer:** Culprit has zero single points of failure. If MongoDB is offline, our API gracefully shifts to an in-memory queue and high-fidelity fallback dataset. If the Gemini API key is missing or quotas are hit, our Triage and Fix Advisor agents produce instant rule-based diagnoses (`source: "rules"`). Judges can test the entire app locally or offline with zero crashes.

---

### Q9: What is the "Team Memory" or "Known Fix" feature?
**Answer:** When an engineer resolves a recurring failure, they can click "Mark as fixed by..." and save a note (and optional commit SHA) attached to that failure's stable 16-hex signature. When the same failure recurs weeks later on any branch, Culprit alerts the team: *"Last time this was fixed by Alex: Type SessionUser was refactored."*

---

### Q10: How do you ensure the webhook responds within GitHub's timeout?
**Answer:** The webhook endpoint verifies the HMAC signature, generates the deduplication hash, pushes the task to the MongoDB `jobQueue` collection, and returns `202 Accepted` within ~150ms. All heavy operations (downloading 50MB logs, parsing steps, agent evaluation) run asynchronously in our worker loop.

---

### Q11: How does Culprit differ from GitHub's native Actions failure summary?
**Answer:** GitHub Actions only shows raw logs and highlights the exit step. It does not:
- Redact leaked secrets in historical logs
- Correlate identical signatures across different branches or runs
- Identify whether a failure is a regression of an earlier resolved issue
- Distinguish flaky tests from genuinely broken code using same-SHA flips
- Suggest unified diff patches with a "verify with" local command

---

### Q12: Can teams using GitLab, CircleCI, or Jenkins use Culprit?
**Answer:** Yes. In addition to native GitHub Webhooks, Culprit exposes a generic ingestion endpoint `POST /api/ingest/:projectId` that accepts standard JUnit XML or Jest JSON with a bearer token via a single `curl` command.

---

### Q13: How is the stable signature generated?
**Answer:** We strip ephemeral tokens (timestamps, PIDs, random temp paths like `/home/runner/work/repo/repo/` -> `<WORKSPACE>/`, memory addresses, and UUIDs) from the primary error message. We then hash `sha1(ruleId + "|" + normalizedPrimaryLine + "|" + category)` to 16 hex characters. The same defect in two different runs always yields the exact same signature.

---

### Q14: How does Culprit fit into the UNCHARTED 2026 track?
**Answer:** Track 3 is "Developer Tools for Production Use Cases". Culprit directly targets the universal pain point where software teams lose hours debugging red builds and re-running flaky tests. It is production-ready, security-hardened, and requires zero login for judges.

---

### Q15: What would you build next (Roadmap)?
**Answer:**
1. Automated PR comment bot that posts idempotent sticky comments on failing pull requests.
2. Atlas Vector Search integration to cluster novel unclassified failures by semantic embedding.
3. n8n outbound workflow automation to dispatch Slack/Discord alerts when high-severity regressions occur.
