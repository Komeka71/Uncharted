'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  GitCommit,
  Clock,
  RotateCcw,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Lock,
  Layers,
  ChevronDown,
  ChevronRight,
  Share2,
  FileText
} from 'lucide-react';

export default function FailureDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'diagnosis' | 'evidence' | 'suspects' | 'trace' | 'history'>('diagnosis');
  const [copiedPatch, setCopiedPatch] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [feedbackVote, setFeedbackVote] = useState<'up' | 'down' | null>(null);
  const [showKnownFixModal, setShowKnownFixModal] = useState(false);
  const [fixNote, setFixNote] = useState('');
  const [fixSha, setFixSha] = useState('');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);

  useEffect(() => {
    async function fetchDetail() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      try {
        const res = await fetch(`${apiUrl}/api/failures/${id}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          // Fallback simulation data for demo mode
          setData(getFallbackData(id));
        }
      } catch (err) {
        setData(getFallbackData(id));
      } finally {
        setLoading(false);
      }
    }

    fetchDetail();
  }, [id]);

  function getFallbackData(failureId: string) {
    return {
      failure: {
        failureId,
        projectId: 'demo-shop',
        runId: 'gh:102030:run-412:1',
        jobName: 'typecheck',
        stepName: 'Run npm run build',
        category: 'build_compile',
        ruleId: 'ts-compile-error',
        signature: 'f4e3d2c1b0a98765',
        transient: false,
        redactionCount: 2,
        status: 'analyzed',
        createdAt: new Date().toISOString()
      },
      diagnosis: {
        diagnosisId: 'diag_fallback_1',
        signature: 'f4e3d2c1b0a98765',
        category: 'build_compile',
        ruleId: 'ts-compile-error',
        title: 'TypeScript Compilation Error',
        summary: "Property 'role' does not exist on type 'SessionUser'",
        rootCause: "The TypeScript compiler failed on `src/services/authService.ts(45,21)` because the `SessionUser` interface was refactored and no longer defines a single `role` string. The codebase now uses `roles: string[]`.",
        confidence: 'high',
        evidenceLines: [5, 6],
        fixSteps: [
          "Open `src/services/authService.ts` at line 45.",
          "Update `user.role` to `user.roles[0]` or `user.roles.includes('admin')`.",
          "Run `npx tsc --noEmit` locally to confirm type resolution."
        ],
        patch: `diff --git a/src/services/authService.ts b/src/services/authService.ts
--- a/src/services/authService.ts
+++ b/src/services/authService.ts
@@ -44,3 +44,3 @@
-  if (user.role === 'admin') {
+  if (user.roles.includes('admin')) {`,
        verifyWith: 'npm run build',
        preventWith: 'Enable strict TypeScript pre-commit hooks.',
        source: 'hybrid',
        model: 'gemini-2.5-flash',
        tokens: 380,
        latencyMs: 1420,
        suspects: [
          {
            sha: 'b4a3c2d',
            author: 'Alex Rivera',
            message: 'refactor auth session payload and user roles',
            files: ['src/services/authService.ts', 'src/types/auth.ts'],
            score: 3.1,
            reasons: ['Directly modified file mentioned in failure trace: `src/services/authService.ts`']
          }
        ]
      },
      agentSteps: [
        {
          seq: 1,
          agent: 'Collector',
          status: 'completed',
          durationMs: 42,
          summary: 'Collected CI run logs (24.2 KB) and commit metadata from GitHub Actions.',
          toolCalls: [{ name: 'fetch_run_artifacts', resultSummary: 'Extracted 8 log lines' }]
        },
        {
          seq: 2,
          agent: 'Triage',
          status: 'completed',
          durationMs: 18,
          summary: 'Classified as ts-compile-error (build_compile). Redacted 2 secrets. Signature: f4e3d2c1b0a98765.',
          toolCalls: [{ name: 'evaluate_rules', resultSummary: 'Matched rule ts-compile-error with 99% confidence' }]
        },
        {
          seq: 3,
          agent: 'Historian',
          status: 'completed',
          durationMs: 25,
          summary: 'Signature seen 4 times. ⚠️ REGRESSION DETECTED! (Previously marked fixed by commit b4a3c2d)',
          toolCalls: [{ name: 'query_signature_history', resultSummary: 'Occurrences: 4, Regression: true' }]
        },
        {
          seq: 4,
          agent: 'Investigator',
          status: 'completed',
          durationMs: 1420,
          summary: 'Gemini root-cause analysis complete. Confidence: high. Validated evidence lines: [5, 6].',
          toolCalls: [
            { name: 'get_log_window', resultSummary: 'Context window provided to LLM' },
            { name: 'validate_line_citations', resultSummary: 'Verified cited lines match redacted log' }
          ]
        },
        {
          seq: 5,
          agent: 'Fix Advisor',
          status: 'completed',
          durationMs: 32,
          summary: 'Synthesized 3 fix actions, git patch, and verification command (`npm run build`).',
          toolCalls: [{ name: 'generate_patch_and_hints', resultSummary: 'Constructed git unified diff patch suggestion' }]
        },
        {
          seq: 6,
          agent: 'Reporter',
          status: 'completed',
          durationMs: 12,
          summary: 'Diagnosis published to MongoDB. Realtime SSE event emitted to connected dashboards.'
        }
      ],
      signature: {
        signature: 'f4e3d2c1b0a98765',
        occurrences: 4,
        status: 'regressed',
        knownFix: {
          note: 'Type SessionUser interface was changed; use user.roles array or check nullable properties.',
          commitSha: 'b4a3c2d',
          author: 'Alex Rivera'
        }
      },
      logLines: [
        { lineNo: 1, text: '2026-10-31T09:02:01.000Z ##[group]Run npm run build' },
        { lineNo: 2, text: '##[command]npm run build' },
        { lineNo: 3, text: '> origin-demo@1.0.0 build' },
        { lineNo: 4, text: '> tsc' },
        { lineNo: 5, text: "src/services/authService.ts(45,21): error TS2339: Property 'role' does not exist on type 'SessionUser'." },
        { lineNo: 6, text: "src/services/authService.ts(45,21): Did you mean 'roles'?" },
        { lineNo: 7, text: '##[error]Process completed with exit code 2.' },
        { lineNo: 8, text: '##[endgroup]' }
      ]
    };
  }

  const failure = data?.failure;
  const diagnosis = data?.diagnosis;
  const agentSteps = data?.agentSteps || [];
  const signature = data?.signature;
  const logLines = data?.logLines || [];
  const suspects = diagnosis?.suspects || [];

  const handleCopyPatch = () => {
    if (diagnosis?.patch) {
      navigator.clipboard.writeText(diagnosis.patch);
      setCopiedPatch(true);
      setTimeout(() => setCopiedPatch(false), 2000);
    }
  };

  const handleCopyMarkdown = () => {
    const md = `# Origin Failure Diagnosis: ${diagnosis?.title || failure?.ruleId}
**Signature:** \`${failure?.signature}\`  
**Category:** ${failure?.category}  
**Confidence:** ${diagnosis?.confidence}  
**Source:** ${diagnosis?.source}  

## Root Cause
${diagnosis?.rootCause}

## Remediation Steps
${diagnosis?.fixSteps?.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

${diagnosis?.patch ? `\`\`\`diff\n${diagnosis.patch}\n\`\`\`` : ''}

**Verify with:** \`${diagnosis?.verifyWith || 'npm test'}\`
`;
    navigator.clipboard.writeText(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  const handleFeedback = async (vote: 'up' | 'down') => {
    setFeedbackVote(vote);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      await fetch(`${apiUrl}/api/failures/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote })
      });
    } catch (e) {}
  };

  const handleSaveKnownFix = async () => {
    if (!fixNote.trim()) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      await fetch(`${apiUrl}/api/signatures/${failure.signature}/known-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: fixNote, commitSha: fixSha })
      });
      setShowKnownFixModal(false);
      window.location.reload();
    } catch (e) {}
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-muted font-mono text-xs">
        Loading failure investigation details...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Back button and breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent font-mono transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/40 text-xs font-mono text-text transition-colors cursor-pointer"
          >
            {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedMarkdown ? 'Copied MD' : 'Copy as Markdown'}</span>
          </button>
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs px-2.5 py-1 rounded bg-accent-soft border border-border text-accent font-mono font-bold uppercase">
              {failure?.category}
            </span>

            <span className="text-base font-bold font-mono text-text">
              {failure?.ruleId}
            </span>

            {signature?.status === 'regressed' && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-mono font-bold animate-pulse">
                ⚠️ REGRESSION DETECTED
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-muted">
            <span>Sig: <strong className="text-accent">{failure?.signature}</strong></span>
            <span>Seen {signature?.occurrences || 1}x</span>
            <span>Job: {failure?.jobName}</span>
          </div>
        </div>

        {/* Known Fix Callout if regressed */}
        {signature?.knownFix && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-300 font-mono">
              <span>🧠 Team Memory: Last Time This Was Fixed By {signature.knownFix.author}</span>
            </div>
            <p className="text-amber-100/90 leading-relaxed font-sans">{signature.knownFix.note}</p>
          </div>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-border/40 gap-2 overflow-x-auto pb-1 text-xs font-mono">
        <button
          onClick={() => setActiveTab('diagnosis')}
          className={`px-4 py-2 rounded-t-lg font-semibold transition-colors cursor-pointer ${
            activeTab === 'diagnosis'
              ? 'bg-surface-2 text-accent border-b-2 border-accent'
              : 'text-muted hover:text-text'
          }`}
        >
          Diagnosis & Fix
        </button>
        <button
          onClick={() => setActiveTab('evidence')}
          className={`px-4 py-2 rounded-t-lg font-semibold transition-colors cursor-pointer ${
            activeTab === 'evidence'
              ? 'bg-surface-2 text-accent border-b-2 border-accent'
              : 'text-muted hover:text-text'
          }`}
        >
          Log Evidence ({logLines.length} lines)
        </button>
        <button
          onClick={() => setActiveTab('suspects')}
          className={`px-4 py-2 rounded-t-lg font-semibold transition-colors cursor-pointer ${
            activeTab === 'suspects'
              ? 'bg-surface-2 text-accent border-b-2 border-accent'
              : 'text-muted hover:text-text'
          }`}
        >
          Suspect Commits ({suspects.length})
        </button>
        <button
          onClick={() => setActiveTab('trace')}
          className={`px-4 py-2 rounded-t-lg font-semibold transition-colors cursor-pointer ${
            activeTab === 'trace'
              ? 'bg-surface-2 text-accent border-b-2 border-accent'
              : 'text-muted hover:text-text'
          }`}
        >
          Agent Trace ({agentSteps.length} stages)
        </button>
      </div>

      {/* TAB 1: Diagnosis & Fix */}
      {activeTab === 'diagnosis' && (
        <div className="space-y-6">
          {/* Root cause card */}
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-accent uppercase font-bold tracking-wider">
                Root Cause Analysis
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded bg-surface-2 font-mono text-muted">
                  Confidence: <strong className="text-accent">{diagnosis?.confidence || 'high'}</strong>
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-surface-2 font-mono text-muted">
                  Source: <strong className="text-text">{diagnosis?.source || 'rules'}</strong>
                </span>
              </div>
            </div>

            <p className="text-sm text-text font-medium leading-relaxed">
              {diagnosis?.rootCause}
            </p>

            {diagnosis?.evidenceLines && (
              <div className="text-xs text-muted font-mono flex items-center gap-2 pt-2 border-t border-border/30">
                <span>Grounded Citations:</span>
                {diagnosis.evidenceLines.map((line: number) => (
                  <button
                    key={line}
                    onClick={() => {
                      setHighlightedLine(line);
                      setActiveTab('evidence');
                    }}
                    className="px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent hover:text-bg font-bold transition-colors cursor-pointer"
                  >
                    Line {line}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fix Steps */}
          <div className="glass-panel p-6 space-y-4">
            <div className="text-xs font-mono text-muted uppercase font-bold tracking-wider">
              Recommended Remediation
            </div>

            <ol className="list-decimal list-inside space-y-2 text-xs text-text">
              {diagnosis?.fixSteps?.map((step: string, idx: number) => (
                <li key={idx} className="leading-relaxed">
                  <span className="font-mono text-accent font-bold mr-1.5">{idx + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>

            {diagnosis?.verifyWith && (
              <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between text-xs font-mono bg-black/40 p-3 rounded-lg border border-border/40">
                <span className="text-muted">Verify locally with:</span>
                <code className="text-accent font-bold">{diagnosis.verifyWith}</code>
              </div>
            )}
          </div>

          {/* Diff Patch Preview */}
          {diagnosis?.patch && (
            <div className="glass-panel p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono text-muted uppercase font-bold">Suggested Unified Diff Patch</div>
                <button
                  onClick={handleCopyPatch}
                  className="flex items-center gap-1.5 text-xs text-accent hover:text-[#34f38b] font-mono cursor-pointer"
                >
                  {copiedPatch ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPatch ? 'Copied' : 'Copy Patch'}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-black/90 border border-border/40 overflow-x-auto font-mono text-xs text-emerald-400 whitespace-pre">
                {diagnosis.patch}
              </div>
            </div>
          )}

          {/* Feedback & Known Fix Buttons */}
          <div className="flex items-center justify-between p-4 glass-panel text-xs">
            <div className="flex items-center gap-3">
              <span className="text-muted">Was this diagnosis helpful?</span>
              <button
                onClick={() => handleFeedback('up')}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  feedbackVote === 'up'
                    ? 'bg-accent/20 border-accent text-accent'
                    : 'bg-surface-2 border-border/40 text-muted hover:text-text'
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleFeedback('down')}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  feedbackVote === 'down'
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'bg-surface-2 border-border/40 text-muted hover:text-text'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setShowKnownFixModal(true)}
              className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/60 text-text font-mono transition-colors cursor-pointer"
            >
              Mark as Fixed by...
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Log Evidence with Line Highlights */}
      {activeTab === 'evidence' && (
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-text uppercase font-mono tracking-wider">Log Excerpt</h3>
              {failure?.redactionCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full badge-glow font-mono flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  {failure.redactionCount} secrets safely redacted
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted font-mono">1-indexed line numbers</span>
          </div>

          <div className="rounded-xl bg-black/90 border border-border/40 p-4 font-mono text-xs overflow-x-auto max-h-[500px] overflow-y-auto space-y-0.5">
            {logLines.map((l: any) => {
              const isCited = diagnosis?.evidenceLines?.includes(l.lineNo) || highlightedLine === l.lineNo;
              return (
                <div
                  key={l.lineNo}
                  id={`log-line-${l.lineNo}`}
                  className={`flex items-start gap-4 px-2 py-0.5 rounded transition-colors ${
                    isCited
                      ? 'bg-accent/20 border-l-2 border-accent text-accent font-bold'
                      : 'text-text/80 hover:bg-surface-2'
                  }`}
                >
                  <span className="text-muted/50 select-none w-8 text-right font-mono text-[11px]">
                    {l.lineNo}
                  </span>
                  <span className="whitespace-pre font-mono flex-1">{l.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Suspect Commits */}
      {activeTab === 'suspects' && (
        <div className="glass-panel p-6 space-y-4">
          <div className="text-xs font-mono text-muted uppercase font-bold tracking-wider">
            Deterministic Suspect Ranking
          </div>

          <div className="space-y-4">
            {suspects.length > 0 ? (
              suspects.map((commit: any, idx: number) => (
                <div key={commit.sha} className="p-4 rounded-xl bg-surface-2 border border-border/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-accent">#{idx + 1} Suspect</span>
                      <span className="text-xs font-mono font-bold text-text bg-black/40 px-2 py-0.5 rounded border border-border/40">
                        {commit.sha}
                      </span>
                      <span className="text-xs text-muted">by {commit.author}</span>
                    </div>

                    <span className="text-xs font-mono font-bold text-accent bg-accent-soft px-2 py-0.5 rounded">
                      Score: +{commit.score}
                    </span>
                  </div>

                  <div className="text-xs font-medium text-text">{commit.message}</div>

                  <div className="space-y-1 pt-1">
                    {commit.reasons?.map((reason: string, rIdx: number) => (
                      <div key={rIdx} className="text-[11px] text-muted font-mono flex items-center gap-1.5">
                        <span className="text-accent">•</span>
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>

                  {commit.files && commit.files.length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-1.5">
                      {commit.files.map((file: string) => (
                        <span
                          key={file}
                          className="text-[10px] px-2 py-0.5 rounded bg-black/40 text-muted font-mono border border-border/30"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-muted text-center py-8">
                No suspect commits detected in range.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Agent Trace Timeline (Visualizes Multi-Agent Pipeline) */}
      {activeTab === 'trace' && (
        <div className="glass-panel p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-text uppercase font-mono tracking-wider">
              Autonomous Agent Trace Timeline
            </h3>
            <span className="text-[11px] text-muted font-mono">6 Orchestrated Stages</span>
          </div>

          <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60">
            {agentSteps.map((step: any) => (
              <div key={step.seq} className="relative space-y-2">
                {/* Glowing Node Dot */}
                <span className="absolute -left-6 top-1.5 w-4 h-4 rounded-full bg-bg border-2 border-accent flex items-center justify-center shadow-glow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                </span>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="font-bold text-accent">{step.agent} Agent</span>
                    <span className="px-1.5 py-0.2 rounded bg-surface-2 text-muted text-[10px] uppercase">
                      {step.status}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted font-mono">{step.durationMs}ms</span>
                </div>

                <div className="text-xs text-text leading-relaxed font-sans bg-surface-2/60 p-3 rounded-lg border border-border/40">
                  {step.summary}
                </div>

                {step.toolCalls && step.toolCalls.length > 0 && (
                  <div className="pl-3 space-y-1 text-[11px] font-mono text-muted">
                    {step.toolCalls.map((tc: any, tcIdx: number) => (
                      <div key={tcIdx} className="flex items-center gap-1.5">
                        <span className="text-accent">↳ tool:</span>
                        <code className="text-text">{tc.name}</code>
                        <span className="text-muted/60">({tc.resultSummary})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Mark As Fixed By... */}
      {showKnownFixModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 max-w-md w-full space-y-4 border border-border shadow-glow-emerald">
            <h3 className="text-sm font-bold text-text font-mono">Mark as Fixed by...</h3>
            <p className="text-xs text-muted">
              Attach a fix note to signature <strong className="text-accent">{failure?.signature}</strong>. Next time this failure recurs, Origin will automatically show this fix to the team.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-muted block mb-1">Fix Note</label>
                <textarea
                  value={fixNote}
                  onChange={(e) => setFixNote(e.target.value)}
                  placeholder="e.g. Added missing dependency to package.json and ran npm install"
                  rows={3}
                  className="w-full bg-black/60 border border-border/40 rounded-lg p-3 text-xs text-text focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-muted block mb-1">Fix Commit SHA (Optional)</label>
                <input
                  type="text"
                  value={fixSha}
                  onChange={(e) => setFixSha(e.target.value)}
                  placeholder="e.g. 9f8e7d6"
                  className="w-full bg-black/60 border border-border/40 rounded-lg p-2.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowKnownFixModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveKnownFix}
                disabled={!fixNote.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-accent text-bg hover:bg-[#34f38b] transition-all cursor-pointer"
              >
                Save Fix Memory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
