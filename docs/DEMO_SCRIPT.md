# Culprit Demo Video Script (7-Minute Submission Guide)

> **Submission Format:** Max 7:00 minutes (Target: 6:30)  
> **Judges Rubric:** Innovation (20%), Functionality (25%), Technical (25%), Problem Relevance (20%), Demo & Docs (10%)

---

### [0:00 - 0:45] The Pain: The Red Build Tax
- **Screen:** Show a GitHub Actions build failing with 5,000 lines of chaotic log output.
- **Voiceover:** *"Every engineering team loses hours to broken CI pipelines and mystery failures. Developers scroll endlessly through thousands of noisy log lines, guess what went wrong, or blindly click 'Re-run' hoping a test wasn't flaky. The same failures repeat week after week because organizational memory is lost. We built **Culprit**, an autonomous CI failure investigator that tells you why your build failed, which commit likely caused it, whether it has happened before, whether the test is flaky, and what to do next."*

---

### [0:45 - 1:45] Instant Diagnosis & Secret Redaction (No Login)
- **Screen:** Open Culprit landing page (`/`). Show the sleek Cyber Emerald UI and the glowing animated pipeline visualization.
- **Action:** Scroll to the **Instant Log Analyzer**. Click the preset sample: *"npm Lockfile Mismatch"*.
- **Voiceover:** *"Culprit requires zero login for judges. Notice our instant analyzer: in less than 50 milliseconds, our deterministic engine classifies the failure across 26+ rules, verifies cited line numbers, and redacts all leaked secrets before anything touches storage or an LLM."*
- **Screen:** Point out the badge *"3 secrets safely redacted"* and the highlighted code line citations.

---

### [1:45 - 3:30] Full Failure Hero Detail & Multi-Agent Trace
- **Screen:** Click *"Launch Live Demo"* or open `/app/failures/fail_ts_001`.
- **Action:** Walk through the Hero Failure Detail view:
  1. **Root Cause Card:** Point out the plain-English explanation, high confidence badge, and `source: hybrid`.
  2. **Unified Diff Patch:** Show the suggested code diff and click **"Copy Patch"**.
  3. **Suspect Commits:** Highlight the ranked commit by Alex Rivera (+3.1 points) with plain-English reason: *"Directly modified file mentioned in failure trace: authService.ts"*.
  4. **Agent Trace Tab:** Click the **"Agent Trace"** tab. Show the vertical timeline of all 6 agents (Collector, Triage, Historian, Investigator, Fix Advisor, Reporter) with latency in milliseconds, status pills, and expandable tool calls.
- **Voiceover:** *"Here is the agentic AI in action. Judges can inspect each step: the Triage agent established deterministic facts, the Historian queried MongoDB, and the Investigator called tools to validate evidence before proposing a verified patch."*

---

### [3:30 - 4:30] Team Memory & Regression Detection
- **Screen:** Point out the red pulsing badge: **"⚠️ REGRESSION DETECTED"**.
- **Voiceover:** *"This is the killer feature: Team Memory. This failure was previously marked resolved. When it returned on a new branch, Culprit flagged the regression and surfaced the previous fix note: 'Type SessionUser interface was changed; use user.roles array'. The team never has to re-solve the same bug twice."*
- **Action:** Click *"Mark as Fixed by..."* and demonstrate saving a new remediation note.

---

### [4:30 - 5:30] Flaky vs Broken Intelligence
- **Screen:** Navigate to `/app/flaky`.
- **Voiceover:** *"Re-running builds until they pass destroys team trust in CI. Culprit analyzes a 30-execution sliding window per test. Look at our Billing Controller test: it shows 2 same-SHA flips. That means the exact same git commit passed on one run and failed on another. Culprit mathematically flags this as Flaky and provides a quarantine recommendation, while consistently failing tests are classified as Broken."*
- **Screen:** Point out the colored sparkline history showing recent pass/fail oscillations.

---

### [5:30 - 6:15] MongoDB Architecture & Aggregations
- **Screen:** Open Dashboard `/app`.
- **Voiceover:** *"Under the hood, Culprit is built on official MongoDB drivers with zero Mongoose bloat:
  - Strict `$jsonSchema` validators and unique compound indexes
  - Automated 14-day log retention with TTL indexes
  - Four custom aggregations: A1 top recurring failures, A2 daily category trends, A3 MTTR, and A4 flaky same-SHA flips
  - Real-time MongoDB change streams broadcasting live events to the dashboard over Server-Sent Events."*

---

### [6:15 - 7:00] Resilient Edge Cases & Conclusion
- **Screen:** Return to top toolbar. Click **"Simulate Run... → Network socket ECONNRESET"**. Watch the live SSE event trigger and navigate to the newly analyzed failure.
- **Voiceover:** *"Notice how transient infrastructure errors like socket disconnects are labeled as likely runner noise, advising the team to re-run rather than modify code. If the LLM key is disabled, Culprit's deterministic fallback still produces 100% reliable diagnoses. Culprit saves engineering teams hundreds of hours every month. Thank you!"*
