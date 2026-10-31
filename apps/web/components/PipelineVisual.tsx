'use client';

import React from 'react';
import { Bot, FileText, ShieldAlert, Cpu, Sparkles, CheckCircle2, GitCommit } from 'lucide-react';

export default function PipelineVisual() {
  return (
    <div className="relative w-full max-w-lg mx-auto aspect-[4/3] rounded-2xl glass-panel p-6 overflow-hidden border border-border shadow-glow-emerald">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-accent/15 rounded-full blur-3xl pointer-events-none" />

      {/* SVG Dashed Connector Lines matching user's reference image */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 120 100 L 260 100 L 260 170 L 380 170 L 380 250"
          fill="none"
          stroke="rgba(43, 227, 127, 0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M 180 220 L 180 280 L 320 280"
          fill="none"
          stroke="rgba(43, 227, 127, 0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M 260 170 L 180 170"
          fill="none"
          stroke="rgba(43, 227, 127, 0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>

      {/* Header Pill: Analysis process */}
      <div className="absolute top-5 right-6 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-soft/80 border border-border text-accent text-xs font-mono font-medium shadow-sm">
        <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
        <span>Autonomous Investigation...</span>
      </div>

      {/* Node 1: Raw Log Input (Top Left) */}
      <div className="absolute top-16 left-8 flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-2 border border-border/60 text-text text-xs backdrop-blur-md shadow-lg">
        <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
          <FileText className="w-3.5 h-3.5" />
        </div>
        <div>
          <div className="font-semibold text-text">Failing Run</div>
          <div className="text-[10px] text-muted font-mono">exit code 1</div>
        </div>
      </div>

      {/* Central Node: AI Brain Glowing Box (Echoing the reference image) */}
      <div className="absolute top-1/2 left-28 -translate-y-1/2 w-24 h-24 rounded-2xl bg-gradient-to-br from-[#0c2417] to-[#041009] border-2 border-accent flex flex-col items-center justify-center text-accent shadow-glow-emerald group cursor-pointer hover:scale-105 transition-transform">
        <div className="text-2xl font-black tracking-wider text-accent drop-shadow-[0_0_12px_rgba(43,227,127,0.8)]">
          AI
        </div>
        <div className="text-[9px] font-mono tracking-widest uppercase text-muted mt-0.5">
          Culprit
        </div>
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-accent shadow-glow-sm" />
      </div>

      {/* Node 3: Secret Redaction (Top Center) */}
      <div className="absolute top-28 left-64 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-2/90 border border-border/60 text-xs backdrop-blur-md">
        <ShieldAlert className="w-3.5 h-3.5 text-accent" />
        <span className="text-[11px] font-mono text-muted">Redact Secrets</span>
      </div>

      {/* Node 4: Suspect Commits Indicator (Middle Right) */}
      <div className="absolute top-44 right-8 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2/90 border border-border/40 text-xs font-mono text-accent">
        <GitCommit className="w-3.5 h-3.5 text-accent" />
        <span className="text-[10px] text-text font-sans">Rank Suspects</span>
      </div>

      {/* Node 5: Verified Diagnosis & Patch (Bottom Right Glowing Card) */}
      <div className="absolute bottom-6 right-8 w-44 rounded-xl bg-gradient-to-br from-[#081a10] to-[#040e08] border border-accent/60 p-3 shadow-glow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <div className="w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono font-bold">
            99% MATCH
          </span>
        </div>
        <div className="text-xs font-semibold text-text leading-tight">npm-lock-out-of-sync</div>
        <div className="text-[10px] text-muted font-mono mt-1">Run `npm install`</div>
      </div>

      {/* Node 6: Flakiness Detector (Bottom Left Node) */}
      <div className="absolute bottom-8 left-10 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-2 border border-border/40 text-xs">
        <div className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Cpu className="w-3 h-3" />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-text">Flake Math</div>
          <div className="text-[9px] text-muted font-mono">same-commit flips</div>
        </div>
      </div>
    </div>
  );
}
