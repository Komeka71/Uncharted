# Origin: Demo Video Script (7 minutes maximum)

**Target length:** about 6:40. **Format:** screen recording with voiceover. Speak slowly and clearly.
**Live site:** https://uncharted-gamma.vercel.app

Each block has a **Screen** line (what to show) and a **Say** line (what to read).

---

### 0:00 – 0:45 | The problem
**Screen:** Slide 2, "A red build says it failed, not why".
**Say:** "Hello, we are Team KeyQuest, and this is Origin. When a CI build fails, developers get hundreds of lines of logs. They scroll, they guess, and they click Re-run and hope. The same failure comes back next week, because nobody remembers the fix. Logs can also leak secrets like tokens. So developers lose time finding the problem, not fixing it."

### 0:45 – 1:15 | The solution
**Screen:** Slide 3, "One failed run in. Five answers out".
**Say:** "Origin fixes this. For every failed run, it answers five questions. Why did it fail? Which commit caused it? Have we seen it before? Is the test flaky or really broken? And how do we fix it? Now let me show you the live product."

### 1:15 – 2:15 | Instant Analyzer (no login)
**Screen:** Open the live site. Scroll through the hero, then click **Analyze a log now**. Click the sample **npm Lockfile Mismatch**, then click **Diagnose Log Now**.
**Say:** "This is our live website. Judges do not need to sign up. Here is the Instant Analyzer. I load a sample failed log and click Diagnose. Origin shows the failure category, the exact log lines that prove it, and a next step. See the hidden token in the log? Secrets are masked before anything is saved or sent to an AI. This part uses rules, not AI, so it is fast and predictable."

### 2:15 – 3:45 | Failure detail and agent trace
**Screen:** Click **Launch live demo**. If the dashboard is empty, click **Seed Demo**. Open a failure. Point at **Root Cause**, then **Suspect Commits**, then the suggested patch. Click the **Agent Trace** tab.
**Say:** "This is the dashboard. It shows recurring failures, flaky tests, and average recovery time. I open one failure. At the top is the root cause in plain English, with a confidence level. Here are the suspect commits. Origin ranks them and gives a reason for each, for example, this commit changed a file named in the error. And here is a suggested patch that I can copy. Now the Agent Trace tab. Six steps ran: Collector, Triage, Historian, Investigator, Fix Advisor, and Reporter. We can see how long each step took and what tools it used. So the AI is not a black box."

### 3:45 – 4:30 | Team memory
**Screen:** Show the **REGRESSION DETECTED** badge and the earlier fix note. Click **Mark as Fixed by...** and type a short note.
**Say:** "This failure has happened before. Origin recognizes it with a fingerprint, and it shows the old fix that the team wrote. That is our team memory. I can also add a new fix note here. A note is only a note. It becomes trusted when a later run confirms it. So we never trust it blindly."

### 4:30 – 5:15 | Flaky versus broken
**Screen:** Click **Flaky Tests** in the top menu. Point at the Verdict and Same-SHA Flips columns.
**Say:** "Re-running builds until they pass hides real problems. On this page, Origin looks at the last thirty runs of each test. If the same commit both passed and failed, the test is flaky, and we suggest quarantine. If a test keeps failing, it is broken. If there is too little data, we say so and do not guess."

### 5:15 – 5:50 | MongoDB
**Screen:** Show Slide 7 (MongoDB) for about 15 seconds, then return to the dashboard.
**Say:** "All of this history lives in MongoDB. Unique indexes stop duplicate webhooks. Four aggregation pipelines power the trends, recurring failures, recovery time, and flaky tests. A TTL index deletes old logs after fourteen days. And a change stream pushes new failures to this screen live."

### 5:50 – 6:25 | Live simulation and connecting a repo
**Screen:** Use **Simulate Run...** and choose a scenario. Show the new failure appearing live. Then open **Project Settings** and show the Webhook URL and **Copy cURL**.
**Say:** "Here I simulate a new failing run, and it appears live on the dashboard. To use Origin on your own repository, open Project Settings, copy the webhook into GitHub, or send logs with one cURL command. If the AI key is missing or the quota ends, Origin still gives a rule-based answer, so the product keeps working."

### 6:25 – 6:45 | Closing
**Screen:** Slide 10, team and links.
**Say:** "To finish: rules decide the facts, MongoDB remembers the history, and AI explains it with evidence. That is Origin. Thank you for watching."

---

## Recording tips

- Record the screen first, then record the voice. Do one timed practice read.
- Maximum allowed length is 7:00. If you run long, shorten the 5:50 block first.
- Hide browser bookmarks, personal tabs, and any real API keys before recording.
- Do a final check that the live URL, GitHub repo, video, and PPT links all open without login.
- Button labels come from the current live site. If a label changes, say what you see on screen.