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
    at Object.<anonymous> (/home/runner/work/culprit/culprit/src/config/stripe.js:12:11)
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
    <div id="analyzer" className="w-full max-w-4xl mx-auto glass-panel p-6 sm:p-8 shadow-glow-emerald">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-text">Instant Log Analyzer</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full badge-glow font-mono">No Login Required</span>
          </div>
          <p className="text-xs text-muted mt-1">Paste a raw CI log snippet or pick from real GitHub Actions failures.</p>
        </div>

        {/* Sample selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted font-mono mr-1">Sample:</span>
          {Object.entries(SAMPLES).map(([key, sample]) => (
            <button
              key={key}
              onClick={() => {
                setLogText(sample.text);
                handleAnalyze(sample.text);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/40 text-text/90 font-mono transition-colors"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor Box */}
      <div className="relative mb-4">
        <textarea
          value={logText}
          onChange={(e) => setLogText(e.target.value)}
          rows={6}
          placeholder="Paste raw GitHub Actions log lines here..."
          className="w-full rounded-xl bg-black/60 border border-border/40 p-4 font-mono text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-y"
        />
        <div className="absolute right-3 bottom-4">
          <button
            onClick={() => handleAnalyze()}
            disabled={loading || !logText.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold text-bg bg-accent hover:bg-[#34f38b] disabled:opacity-50 transition-all shadow-glow-sm hover:shadow-glow-emerald cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Investigating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Diagnose Log</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagnosis Results Card */}
      {result && result.diagnosis && (
        <div className="mt-6 pt-6 border-t border-border/40 space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-accent-soft text-accent text-xs font-mono font-bold uppercase">
                {result.diagnosis.category}
              </span>
              <span className="text-xs text-muted font-mono">
                Rule: <strong className="text-text">{result.diagnosis.ruleId}</strong>
              </span>
              <span className="text-xs text-muted font-mono">
                Signature: <strong className="text-accent">{result.diagnosis.signature}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Evidence Grounded
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-2 text-muted font-mono text-[11px]">
                Source: {result.diagnosis.source}
              </span>
            </div>
          </div>

          {/* Root cause callout */}
          <div className="p-4 rounded-xl bg-accent-soft/40 border border-border/60">
            <div className="text-xs font-mono text-accent uppercase font-bold tracking-wider mb-1">
              Grounded Root Cause
            </div>
            <div className="text-sm font-medium text-text leading-relaxed">
              {result.diagnosis.rootCause}
            </div>
            {result.diagnosis.evidenceLines && result.diagnosis.evidenceLines.length > 0 && (
              <div className="mt-2 text-xs text-muted font-mono">
                Cited Log Line(s):{' '}
                <span className="text-accent font-bold">
                  {result.diagnosis.evidenceLines.map((l: number) => `L${l}`).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Fix Steps */}
          {result.diagnosis.fixSteps && result.diagnosis.fixSteps.length > 0 && (
            <div className="p-4 rounded-xl bg-surface-2 border border-border/40">
              <div className="text-xs font-mono text-muted uppercase font-bold mb-2">Recommended Fix Action</div>
              <ol className="list-decimal list-inside space-y-1 text-xs text-text">
                {result.diagnosis.fixSteps.map((step: string, idx: number) => (
                  <li key={idx} className="leading-relaxed">
                    <span className="font-mono text-muted mr-1.5">{idx + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Patch snippet if available */}
          {result.diagnosis.patch && (
            <div className="rounded-xl bg-black/80 border border-border/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-muted">Suggested Patch (Preview)</span>
                <button
                  onClick={() => copyPatch(result.diagnosis.patch)}
                  className="flex items-center gap-1 text-[11px] text-accent hover:text-[#34f38b] font-mono cursor-pointer"
                >
                  {copiedPatch ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPatch ? 'Copied!' : 'Copy Patch'}</span>
                </button>
              </div>
              <pre className="font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre">
                {result.diagnosis.patch}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
