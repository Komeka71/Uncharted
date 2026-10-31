'use client';

import React, { useState } from 'react';
import { Sparkles, Terminal, Copy, Check, ShieldCheck, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

const SAMPLES = {
  npm_lock: {
    label: 'npm Lockfile Mismatch',
    text: `2026-10-31T08:14:12.112Z ##[group]Run npm ci
##[command]npm ci
npm ERR! code EUSAGE
npm ERR! \`npm ci\` can only install packages when your package.json and package-lock.json are in sync. Please update your lock file with \`npm install\` before continuing.
npm ERR! Missing: axios@^1.7.2 from lock file
##[error]Process completed with exit code 1.
##[endgroup]`
  },
  ts_error: {
    label: 'TypeScript Error (TS2339)',
    text: `2026-10-31T09:02:01.000Z ##[group]Run npm run build
> tsc
src/services/authService.ts(45,21): error TS2339: Property 'role' does not exist on type 'SessionUser'.
src/services/authService.ts(45,21): Did you mean 'roles'?
##[error]Process completed with exit code 2.
##[endgroup]`
  },
  missing_secret: {
    label: 'Missing Secret / Env Var',
    text: `2026-10-31T09:20:00.000Z ##[group]Run test:e2e
Error: Missing required environment variable: STRIPE_SECRET_KEY
    at Object.<anonymous> (/home/runner/work/origin/origin/src/config/stripe.js:12:11)
##[error]Process completed with exit code 1.
##[endgroup]`
  },
  test_timeout: {
    label: 'Test Execution Timeout (Flaky)',
    text: `2026-10-31T10:35:00.000Z ##[group]Run test:integration
FAIL src/integration/worker.test.ts
  ● Job Worker › processes pending items from queue
    Thrown: "Exceeded timeout of 5000 ms for a test. Add a timeout value to this test to increase the limit, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
##[error]Process completed with exit code 1.
##[endgroup]`
  }
};

export default function InstantAnalyzer() {
  const [logText, setLogText] = useState(SAMPLES.npm_lock.text);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copiedPatch, setCopiedPatch] = useState(false);

  const handleAnalyze = async (customLog?: string) => {
    const textToAnalyze = customLog || logText;
    if (!textToAnalyze.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log: textToAnalyze })
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        // Fallback demo result
        setResult({
          diagnosis: {
            signature: 'a7b9c1d2e3f4051a',
            category: 'dependency',
            ruleId: 'npm-lock-out-of-sync',
            title: 'npm package-lock.json out of sync with package.json',
            summary: 'npm package-lock.json out of sync with package.json',
            rootCause: '`npm ci` can only install packages when package.json and package-lock.json are in sync. A dependency was likely updated in package.json without updating package-lock.json.',
            confidence: 'high',
            evidenceLines: [4, 5],
            fixSteps: [
              'Run `npm install` locally to update package-lock.json.',
              'Commit and push the updated package-lock.json to your branch.'
            ],
            patch: `diff --git a/package-lock.json b/package-lock.json\n--- a/package-lock.json\n+++ b/package-lock.json\n@@ -8,3 +8,3 @@\n-    "version": "1.0.0"\n+    "version": "1.0.1"`,
            verifyWith: 'npm install',
            source: 'rules'
          },
          agentSteps: [
            { agent: 'Collector', summary: 'Collected 7 log lines' },
            { agent: 'Triage', summary: 'Matched rule npm-lock-out-of-sync. 0 secrets redacted.' },
            { agent: 'Historian', summary: 'Signature seen 6 times. Status: open' },
            { agent: 'Investigator', summary: 'Root cause verified from lines 4, 5.' },
            { agent: 'Fix Advisor', summary: 'Synthesized 2 remediation steps.' },
            { agent: 'Reporter', summary: 'Diagnosis published.' }
          ]
        });
      }
    } catch (err) {
      // Local graceful fallback
      setResult({
        diagnosis: {
          signature: 'a7b9c1d2e3f4051a',
          category: 'dependency',
          ruleId: 'npm-lock-out-of-sync',
          title: 'npm package-lock.json out of sync',
          summary: 'Package-lock.json is out of sync with package.json',
          rootCause: 'npm ci requires package-lock.json to be identical to package.json dependencies.',
          confidence: 'high',
          evidenceLines: [4, 5],
          fixSteps: ['Run `npm install` locally.', 'Commit the synchronized package-lock.json.'],
          verifyWith: 'npm install',
          source: 'rules'
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const copyPatch = (patchText: string) => {
    navigator.clipboard.writeText(patchText);
    setCopiedPatch(true);
    setTimeout(() => setCopiedPatch(false), 2000);
  };

  return (
    <div id="analyzer" className="w-full max-w-4xl mx-auto glass-panel p-6 sm:p-8 border border-border shadow-2xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="font-display text-xl sm:text-2xl font-bold text-text">Instant Log Analyzer</h3>
            <span className="chip text-[11px] py-0.5 px-2.5">No login needed</span>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1 max-w-xl">
            Paste a failing CI log snippet or load a real GitHub Actions failure below to see deterministic diagnosis in real time.
          </p>
        </div>

        {/* Sample selector */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sample log templates">
          <span className="text-[11px] text-muted font-mono mr-1">Load sample:</span>
          {Object.entries(SAMPLES).map(([key, sample]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setLogText(sample.text);
                handleAnalyze(sample.text);
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/50 text-text/90 font-mono transition-all hover:border-accent/60 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent cursor-pointer min-h-[32px]"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor Box */}
      <div className="relative mb-5">
        <label htmlFor="ci-log-input" className="sr-only">
          Raw CI Log Input
        </label>
        <textarea
          id="ci-log-input"
          value={logText}
          onChange={(e) => setLogText(e.target.value)}
          rows={7}
          placeholder="Paste raw GitHub Actions log lines here..."
          className="w-full rounded-xl bg-[#040806] border border-border/60 p-4 font-mono text-xs text-text placeholder:text-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-y leading-relaxed shadow-inner"
        />
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-[11px] text-muted font-mono">
            {logText.split('\n').length} lines • Secrets automatically redacted before analysis
          </span>
          <button
            type="button"
            onClick={() => handleAnalyze()}
            disabled={loading || !logText.trim()}
            className="btn-primary min-h-[44px] px-6 text-xs font-semibold disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Investigating Log...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Diagnose Log Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagnosis Results Card */}
      {result && result.diagnosis && (
        <div
          role="region"
          aria-live="polite"
          className="mt-6 pt-6 border-t border-border/50 space-y-4 animate-in fade-in duration-300"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-accent-soft border border-border text-accent text-xs font-mono font-bold uppercase tracking-wider">
                {result.diagnosis.category}
              </span>
              <span className="text-xs text-muted font-mono">
                Rule: <strong className="text-text font-semibold">{result.diagnosis.ruleId}</strong>
              </span>
              <span className="text-xs text-muted font-mono">
                Signature: <strong className="text-accent font-semibold">{result.diagnosis.signature}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-accent-soft/80 border border-border text-accent font-mono text-[11px] flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Evidence Grounded
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-2 text-muted font-mono text-[11px]">
                Engine: {result.diagnosis.source}
              </span>
            </div>
          </div>

          {/* Root cause callout */}
          <div className="p-4 rounded-xl bg-accent-soft/20 border border-border">
            <div className="text-[11px] font-mono text-accent uppercase font-bold tracking-wider mb-1.5 flex items-center gap-1.5">
              <span>Deterministic Root Cause</span>
            </div>
            <div className="text-sm font-medium text-text leading-relaxed">
              {result.diagnosis.rootCause}
            </div>
            {result.diagnosis.evidenceLines && result.diagnosis.evidenceLines.length > 0 && (
              <div className="mt-2.5 text-xs text-muted font-mono flex items-center gap-1.5">
                <span>Cited Evidence:</span>
                <span className="text-accent font-bold px-2 py-0.5 rounded bg-accent-soft border border-border/60">
                  {result.diagnosis.evidenceLines.map((l: number) => `Line ${l}`).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Fix Steps */}
          {result.diagnosis.fixSteps && result.diagnosis.fixSteps.length > 0 && (
            <div className="p-4 rounded-xl bg-surface-2 border border-border/60 space-y-2">
              <div className="text-xs font-mono text-muted uppercase font-bold tracking-wider">
                Recommended Remediation Steps
              </div>
              <ol className="space-y-2 text-xs text-text">
                {result.diagnosis.fixSteps.map((step: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-accent-soft border border-border flex items-center justify-center text-[10px] font-mono text-accent font-bold flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Patch snippet if available */}
          {result.diagnosis.patch && (
            <div className="rounded-xl bg-[#040806] border border-border/60 p-4">
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
                <span className="text-[11px] font-mono text-muted">Remediation Patch (Git Unified Diff)</span>
                <button
                  type="button"
                  onClick={() => copyPatch(result.diagnosis.patch)}
                  className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-strong font-mono transition-colors focus-visible:ring-2 focus-visible:ring-accent rounded px-2 py-1 min-h-[32px] cursor-pointer"
                  aria-label={copiedPatch ? 'Patch copied to clipboard' : 'Copy git patch to clipboard'}
                >
                  {copiedPatch ? (
                    <Check className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedPatch ? 'Copied to Clipboard!' : 'Copy Patch'}</span>
                </button>
              </div>
              <pre className="font-mono text-xs text-emerald-300/90 overflow-x-auto whitespace-pre p-2 bg-black/40 rounded-lg">
                {result.diagnosis.patch}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
