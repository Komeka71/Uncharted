'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  GitCommit,
  Sparkles,
  Activity,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  Cpu
} from 'lucide-react';

export default function PipelineVisual() {
  const [phase, setPhase] = useState<'log' | 'diagnosing' | 'resolved'>('resolved');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);

    if (mediaQuery.matches) {
      setPhase('resolved');
      return () => mediaQuery.removeEventListener('change', handler);
    }

    // Slow elegant loop: log stream -> diagnosing -> resolved
    let isMounted = true;
    const runCycle = async () => {
      while (isMounted) {
        setPhase('log');
        await new Promise((r) => setTimeout(r, 3800));
        if (!isMounted) break;
        setPhase('diagnosing');
        await new Promise((r) => setTimeout(r, 1400));
        if (!isMounted) break;
        setPhase('resolved');
        await new Promise((r) => setTimeout(r, 6400));
      }
    };
    runCycle();

    return () => {
      isMounted = false;
      mediaQuery.removeEventListener('change', handler);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText('npm install && git add package-lock.json');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full max-w-xl mx-auto">
      {/* Ambient background glows behind the card */}
      <div className="absolute -top-10 -right-10 w-72 h-72 bg-accent/20 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-teal-500/15 rounded-full blur-[90px] pointer-events-none" />

      {/* Floating status chips */}
      <div className="absolute -top-3.5 -left-2 z-20 hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-elevated/95 border border-border text-[11px] font-mono text-accent shadow-lg shadow-black/40 backdrop-blur-md">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
        <span>🔒 Secrets redacted</span>
      </div>

      <div className="absolute -bottom-3 right-4 z-20 hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-elevated/95 border border-border text-[11px] font-mono text-text shadow-lg shadow-black/40 backdrop-blur-md">
        <GitCommit className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
        <span>Suspect: <strong className="text-accent font-mono">a1b2c3d</strong></span>
      </div>

      <div className="absolute top-1/2 -right-3 -translate-y-1/2 z-20 hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-elevated/95 border border-border text-[11px] font-mono text-emerald-300 shadow-lg shadow-black/40 backdrop-blur-md">
        <Activity className="w-3 h-3 text-accent" aria-hidden="true" />
        <span>Flaky score: 0.04</span>
      </div>

      {/* Main Glass Investigation Card */}
      <div className="glass-panel p-5 sm:p-6 border border-border/80 shadow-2xl relative overflow-hidden rounded-2xl">
        {/* Card Header Bar */}
        <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5" aria-hidden="true">
              <div className="w-2.5 h-2.5 rounded-full bg-danger/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-warn/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-accent/80" />
            </div>
            <span className="text-xs font-mono text-muted pl-1">ci-run #1428 • main</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-2 border border-border/60 text-[11px] font-mono text-accent">
              <span
                className={`w-2 h-2 rounded-full ${
                  phase === 'resolved' ? 'bg-accent' : 'bg-warn animate-pulse'
                }`}
                aria-hidden="true"
              />
              <span>
                {phase === 'log'
                  ? 'Streaming failure...'
                  : phase === 'diagnosing'
                  ? 'Origin Triaging...'
                  : 'Diagnosis ready'}
              </span>
            </span>
          </div>
        </div>

        {/* Multi-Agent Execution Progress Breadcrumbs */}
        <div className="grid grid-cols-4 gap-1.5 pb-3 mb-3 border-b border-white/5 text-[10px] font-mono">
          <div className={`px-2 py-1 rounded text-center truncate ${phase !== 'log' ? 'bg-accent/15 text-accent border border-accent/30 font-semibold' : 'bg-surface-2 text-muted'}`}>
            1. Ingest
          </div>
          <div className={`px-2 py-1 rounded text-center truncate ${phase !== 'log' ? 'bg-accent/15 text-accent border border-accent/30 font-semibold' : 'bg-surface-2 text-muted'}`}>
            2. Redact
          </div>
          <div className={`px-2 py-1 rounded text-center truncate ${phase === 'diagnosing' || phase === 'resolved' ? 'bg-accent/15 text-accent border border-accent/30 font-semibold' : 'bg-surface-2 text-muted'}`}>
            3. Classify
          </div>
          <div className={`px-2 py-1 rounded text-center truncate ${phase === 'resolved' ? 'bg-accent text-bg font-bold shadow-sm' : 'bg-surface-2 text-muted'}`}>
            4. Patch
          </div>
        </div>

        {/* Content area */}
        <div className="space-y-3.5">
          {/* Simulated CI Log Stream with Redaction */}
          <div className="rounded-xl bg-[#030605] border border-border/60 p-3.5 font-mono text-xs overflow-hidden relative">
            <div className="flex items-center justify-between text-[10px] text-muted mb-2 pb-1.5 border-b border-white/5">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-muted" aria-hidden="true" />
                GITHUB ACTIONS LOG STREAM
              </span>
              <span className="text-accent flex items-center gap-1 font-semibold">
                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                100% redacted
              </span>
            </div>
            <div className="space-y-1 text-[11px] leading-relaxed select-none overflow-x-auto">
              <div className="text-muted/70">10:14:02.100Z [info] Initializing runner ubuntu-latest</div>
              <div className="text-muted/70">
                10:14:03.450Z [info] Auth secret: <span className="bg-accent-soft text-accent px-1.5 py-0.5 rounded font-mono font-bold">ghp_████████████████</span>
              </div>
              <div className="text-muted/90">10:14:04.220Z [run] npm ci --audit=false</div>
              <div className="text-danger flex items-start gap-1.5 font-medium bg-danger/10 p-2 rounded border border-danger/25">
                <span className="text-danger font-bold">✖</span>
                <span>npm ERR! code EUSAGE: `npm ci` can only install packages when package.json and lockfile are in sync.</span>
              </div>
              <div className="text-muted/60 text-[10px]">10:14:05.002Z Process completed with exit code 1.</div>
            </div>
          </div>

          {/* Diagnosis Resolution Panel */}
          <div className="rounded-xl bg-surface-2/90 border border-border p-3.5 sm:p-4 space-y-3 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-accent-soft border border-border text-accent text-xs font-mono font-bold uppercase tracking-wider">
                  DEPENDENCY
                </span>
                <span className="text-xs font-mono text-muted">
                  Rule: <strong className="text-text font-semibold">npm-lock-out-of-sync</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted">
                <span>Confidence:</span>
                <span className="text-accent font-bold">100% deterministic</span>
              </div>
            </div>

            {/* Root cause and fix snippet */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
              <div className="p-2.5 rounded-lg bg-bg/80 border border-border/40">
                <div className="text-[10px] font-mono uppercase text-muted mb-1 flex items-center gap-1">
                  <GitCommit className="w-3 h-3 text-accent" aria-hidden="true" />
                  <span>Suspect Commit</span>
                </div>
                <div className="text-xs text-text font-mono font-medium">
                  a1b2c3d <span className="text-accent font-sans text-[11px]">(+3 score)</span>
                </div>
                <div className="text-[11px] text-muted truncate mt-0.5">bump axios in package.json</div>
              </div>

              <div className="p-2.5 rounded-lg bg-bg/80 border border-border/40">
                <div className="text-[10px] font-mono uppercase text-muted mb-1 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-accent" aria-hidden="true" />
                  <span>Flaky Test Meter</span>
                </div>
                <div className="text-xs text-emerald-400 font-mono font-medium">0.04 (Deterministic)</div>
                <div className="text-[11px] text-muted mt-0.5">Consistent SHA breakage</div>
              </div>
            </div>

            {/* Suggested Fix with Copy Button */}
            <div className="p-2.5 rounded-lg bg-accent-soft/30 border border-border/60 flex items-center justify-between gap-2">
              <div className="font-mono text-xs text-text truncate">
                <span className="text-accent font-bold mr-1">$</span>
                npm install && git add package-lock.json
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="chip text-[10px] py-0.5 px-2 flex-shrink-0 hover:border-accent transition-colors cursor-pointer"
                aria-label="Copy fix command"
              >
                {copied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
