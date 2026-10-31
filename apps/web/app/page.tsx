'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import PipelineVisual from '../components/PipelineVisual';
import InstantAnalyzer from '../components/InstantAnalyzer';
import {
  ShieldAlert,
  GitCommit,
  Cpu,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock,
  Layers,
  Database,
  RefreshCw
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 px-6 max-w-7xl mx-auto w-full">
        {/* Glow backdrop behind hero */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          {/* Left Column: Headlines & Pitch */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full badge-glow text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>UNCHARTED 2026 • TRACK 3: DEV TOOLS</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-text leading-[1.1]">
              Know why your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-[#54f69f] to-[#5BB8FF]">
                build broke
              </span>
              , in seconds.
            </h1>

            <p className="text-base sm:text-lg text-muted max-w-xl leading-relaxed">
              CI tells you that your build failed. Culprit investigates the wall of logs, redacts secrets, classifies 26+ deterministic rules, ranks the suspect commit, and gives you a grounded fix.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="#analyzer"
                className="px-6 py-3 rounded-full text-sm font-bold text-bg bg-text hover:bg-white transition-all shadow-glow-sm hover:scale-105"
              >
                Analyze a Log Now
              </a>

              <Link
                href="/app"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-text bg-surface-2 hover:bg-surface-3 border border-border/60 transition-all hover:border-accent hover:text-accent"
              >
                <span>Launch Live Demo</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Quick trust metrics */}
            <div className="pt-6 border-t border-border/30 grid grid-cols-3 gap-6 text-left">
              <div>
                <div className="text-xl sm:text-2xl font-bold text-text font-mono">26+</div>
                <div className="text-xs text-muted">CI Rules Classified</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-accent font-mono">100%</div>
                <div className="text-xs text-muted">Secrets Redacted</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-[#5BB8FF] font-mono">0 Login</div>
                <div className="text-xs text-muted">One-Click Seed</div>
              </div>
            </div>
          </div>

          {/* Right Column: Cyber Glowing Pipeline Diagram */}
          <div className="lg:col-span-5">
            <PipelineVisual />
          </div>
        </div>
      </section>

      {/* Section 2: Interactive Instant Log Analyzer */}
      <section className="py-12 px-6 max-w-7xl mx-auto w-full">
        <InstantAnalyzer />
      </section>

      {/* Section 3: How It Works */}
      <section id="how-it-works" className="py-20 px-6 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <div className="text-xs font-mono text-accent uppercase font-bold tracking-wider">
            Autonomous Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text">
            Deterministic Engine First, <br />Agentic AI Second.
          </h2>
          <p className="text-sm text-muted">
            The LLM never guesses whether a build failed. Deterministic rules establish facts; agents correlate history, suspect files, and remediation patches.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="glass-panel p-6 space-y-4 glass-panel-hover">
            <div className="w-10 h-10 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-text">1. Cleanse & Redact</h3>
            <p className="text-xs text-muted leading-relaxed">
              Strips ANSI garbage, normalizes ISO timestamps, and redacts GitHub PATs, AWS credentials, and connection strings before storage or LLM processing.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-panel p-6 space-y-4 glass-panel-hover">
            <div className="w-10 h-10 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-text">2. Multi-Agent Investigation</h3>
            <p className="text-xs text-muted leading-relaxed">
              Six specialized agents (Collector, Triage, Historian, Investigator, Fix Advisor, Reporter) query historical runs, changed files, and verified line citations.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-panel p-6 space-y-4 glass-panel-hover">
            <div className="w-10 h-10 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent">
              <GitCommit className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-text">3. Suspects & Flake Math</h3>
            <p className="text-xs text-muted leading-relaxed">
              Scores suspect commits that touched failing files (+3/+2/+1) and mathematically distinguishes consistent breakages from flaky same-SHA flips.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40 py-8 px-6 text-center text-xs text-muted">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-text">Culprit</span>
            <span>• Built for UNCHARTED 2026 (NEXUS SVNIT Surat)</span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px]">
            <span>MongoDB Atlas</span>
            <span>Google Gemini</span>
            <span>GitHub Actions</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
