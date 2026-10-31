# Origin Demo Video Script (7-Minute Submission Guide)

**Maximum length:** 7:00 minutes  
**Target length:** Approximately 6:40  
**Format:** Screen recording with voiceover  
**Live website:** https://uncharted-gamma.vercel.app

**Judges' Evaluation Rubric**
- Innovation – 20%
- Functionality – 25%
- Technical – 25%
- Problem Relevance – 20%
- Demo & Documentation – 10%

Each section includes what to show on screen and what to say.

---

### [0:00–0:45] The Problem – The Red Build Tax

**Screen:** Show Slide 2: “A red build says it failed, not why.”

**Voiceover:**

"Hello, we are Team KeyQuest, and this is Origin. When a CI build fails, developers get hundreds of lines of logs. They scroll, they guess, and they click Re-run and hope. The same failure comes back next week because nobody remembers the fix. Logs can also leak secrets like tokens. So developers lose time finding the problem instead of fixing it."

---

### [0:45–1:15] The Solution

**Screen:** Show Slide 3: “One failed run in. Five answers out.”

**Voiceover:**

"Origin fixes this. For every failed run, it answers five questions. Why did it fail? Which commit caused it? Have we seen it before? Is the test flaky or really broken? And how do we fix it? Now let me show you the live product."

---

### [1:15–2:15] Instant Analyzer – No Login Required

**Screen:** Open the live website. Scroll through the homepage and click **Analyze a log now**. Select the sample **npm Lockfile Mismatch**, then click **Diagnose Log Now**.

**Voiceover:**

"This is our live website. Judges do not need to sign up. Here is the Instant Analyzer. I load a sample failed log and click Diagnose. Origin shows the failure category, the exact log lines that prove it, and a next step.

Notice the sensitive information in the log. Secrets are masked before anything is saved or sent to an AI. This part uses deterministic rules rather than AI, making the initial diagnosis fast and predictable."

---

### [2:15–3:45] Failure Details and Multi-Agent Trace

**Screen:** Click **Launch live demo**. If the dashboard is empty, click **Seed Demo**. Open a failure.

**Actions:**
1. Show the **Root Cause** card and its plain-English explanation.
2. Show **Suspect Commits** and explain how Origin ranks potentially responsible commits.
3. Show the suggested patch and the copy option.
4. Open the **Agent Trace** tab.
5. Show the six stages: Collector, Triage, Historian, Investigator, Fix Advisor, and Reporter.

**Voiceover:**

"This is the dashboard. It shows recurring failures, flaky tests, and average recovery time.

I open one failure. At the top is the root cause in plain English, with a confidence level. Here are the suspect commits. Origin ranks them and gives a reason for each, helping developers understand which change may have caused the failure.

Here is a suggested patch that I can copy.

Now let's open the Agent Trace tab. Six steps ran: Collector, Triage, Historian, Investigator, Fix Advisor, and Reporter. We can inspect the steps, their status, execution time, and tool calls. This makes the investigation process easier to understand rather than leaving the AI as a black box."

---

### [3:45–4:30] Team Memory and Regression Detection

**Screen:** Show the **REGRESSION DETECTED** badge and an earlier fix note. Click **Mark as Fixed by...** and enter a short note.

**Voiceover:**

"This failure has happened before. Origin recognizes it with a fingerprint and shows the previous fix recorded by the team. That is our Team Memory.

I can also add a new fix note here. A note is only a note. It becomes trusted when a later run confirms it. This helps teams reuse previous solutions without blindly trusting unverified fixes."

---

### [4:30–5:15] Flaky vs. Broken Intelligence

**Screen:** Click **Flaky Tests** in the top menu. Point to the Verdict and Same-SHA Flips columns.

**Voiceover:**

"Re-running builds until they pass can hide real problems. On this page, Origin looks at the last thirty runs of each test.

If the same commit both passed and failed, the test is identified as flaky, and Origin suggests quarantine. If a test keeps failing, it is classified as broken. If there is too little data, Origin says so instead of guessing."

---

### [5:15–5:50] MongoDB Architecture

**Screen:** Show Slide 7 about MongoDB for approximately 15 seconds, then return to the dashboard.

**Voiceover:**

"All of this history lives in MongoDB. Unique indexes help prevent duplicate webhooks. Four aggregation pipelines power the trends, recurring failures, recovery time, and flaky test analysis.

A TTL index deletes old logs after fourteen days. MongoDB change streams also allow new failures to appear on the dashboard in real time."

---

### [5:50–6:25] Live Simulation and Connecting a Repository

**Screen:** Open **Simulate Run...** and choose a scenario. Show the new failure appearing on the dashboard. Then open **Project Settings** and show the Webhook URL and **Copy cURL** option.

**Voiceover:**

"Here I simulate a new failing run, and it appears live on the dashboard.

To use Origin with your own repository, open Project Settings, configure the webhook in GitHub, or send logs using a cURL command.

If the AI key is missing or the quota is exhausted, Origin can still provide a rule-based diagnosis. This means the core failure analysis does not depend entirely on AI availability."

---

### [6:25–6:45] Closing

**Screen:** Show Slide 10 with the team and project links.

**Voiceover:**

"To finish: rules decide the facts, MongoDB remembers the history, and AI explains it with evidence. That is Origin. Thank you for watching."

---

## Recording Tips

- Record the screen first, then record the voiceover.
- Do one timed practice read before the final recording.
- Keep the final video under 7 minutes.
- If you run over time, shorten the live simulation section first.
- Hide browser bookmarks, personal tabs, and any real API keys before recording.
- Check that the live website, GitHub repository, video, and presentation links open correctly.
- Button labels may change. Follow the labels visible on the current live website.

