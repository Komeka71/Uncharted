'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import PipelineVisual from '../components/PipelineVisual';
import InstantAnalyzer from '../components/InstantAnalyzer';
import {
  ShieldCheck,
  ShieldAlert,
  GitCommit,
  Cpu,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Lock,
  Database,
  Terminal,
  Activity,
  Workflow,
  ChevronDown,
  Layers,
  Flame,
  FileCode,
  ExternalLink
} from 'lucide-react';

const FAILURE_PHRASES = [
  'build broke',
  'lockfile drifted',
  'test went flaky',
  'secret went missing',
  'type check failed'
];

export default function LandingPage() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [fadePhrase, setFadePhrase] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  // Count-up trust metrics state
  const [hasCounted, setHasCounted] = useState(false);
  const [counts, setCounts] = useState({ rules: 0, secrets: 0, login: 0 });
  const metricsRef = useRef<HTMLDivElement>(null);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Rotating headline failure phrase
  useEffect(() => {
    if (prefersReducedMotion) return;

    const interval = setInterval(() => {
      setFadePhrase(false);
      setTimeout(() => {
        setPhraseIndex((prev) => (prev + 1) % FAILURE_PHRASES.length);
        setFadePhrase(true);
      }, 250);
    }, 3200);

    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  // Gentle desktop parallax on mouse move
  useEffect(() => {
    if (prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 24;
      const y = (e.clientY / window.innerHeight - 0.5) * 24;
      setMouseOffset({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [prefersReducedMotion]);

  // Count-up animation using IntersectionObserver
  useEffect(() => {
    if (prefersReducedMotion) {
      setCounts({ rules: 26, secrets: 100, login: 0 });
      setHasCounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasCounted) {
          setHasCounted(true);
          const duration = 1400;
          const startTime = performance.now();

          const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out expo
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            setCounts({
              rules: Math.floor(easeProgress * 26),
              secrets: Math.floor(easeProgress * 100),
              login: 0
            });

            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              setCounts({ rules: 26, secrets: 100, login: 0 });
            }
          };

          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );

    if (metricsRef.current) {
      observer.observe(metricsRef.current);
    }

    return () => observer.disconnect();
  }, [hasCounted, prefersReducedMotion]);

  return (
    <div className="min-h-screen flex flex-col relative bg-bg ambient-grid overflow-x-hidden selection:bg-accent/30 selection:text-text">
      {/* Background ambient radial glow orbs */}
      <div
        className="absolute top-20 left-1/4 w-[520px] h-[520px] bg-accent/8 rounded-full blur-[140px] pointer-events-none transition-transform duration-700 ease-out"
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate(${mouseOffset.x * 0.8}px, ${mouseOffset.y * 0.8}px)`
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-96 right-1/4 w-[480px] h-[480px] bg-teal-500/6 rounded-full blur-[150px] pointer-events-none transition-transform duration-700 ease-out"
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate(${-mouseOffset.x * 0.6}px, ${-mouseOffset.y * 0.6}px)`
        }}
        aria-hidden="true"
      />

      <Navbar />

      <main id="main" className="flex-1 focus:outline-none">
        {/* ========================================================= */}
        {/* SECTION 1: HERO SECTION                                   */}
        {/* ========================================================= */}
        <section
          aria-labelledby="hero-heading"
          className="relative pt-12 sm:pt-16 lg:pt-20 pb-16 sm:pb-24 px-6 max-w-7xl mx-auto w-full"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Column: Headlines & Pitch */}
            <div className="lg:col-span-7 space-y-6">
              {/* Event Badge */}
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full chip text-xs font-mono font-medium border border-accent/30 bg-accent-soft/40 shadow-sm backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
                <span>ORIGIN • AUTONOMOUS CI INVESTIGATOR</span>
                <span className="text-muted/60">•</span>
                <span className="text-accent/90">UNCHARTED 2026</span>
              </div>

              {/* Main Headline with Rotating Failure Phrase */}
              <h1
                id="hero-heading"
                className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text leading-[1.12]"
              >
                Know why your{' '}
                <span
                  aria-live="polite"
                  className={`inline-block font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-strong to-[#2DD4BF] transition-all duration-300 drop-shadow-[0_0_24px_rgba(52,211,153,0.3)] ${
                    fadePhrase ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
                  }`}
                >
                  {prefersReducedMotion ? 'build broke' : FAILURE_PHRASES[phraseIndex]}
                </span>
                ,<br />in seconds.
              </h1>

              {/* Subcopy */}
              <p className="text-base sm:text-lg text-muted max-w-xl leading-relaxed">
                CI tells you that your build failed. Origin investigates the wall of logs, redacts secrets, classifies 26+ deterministic rules, ranks the suspect commit, and gives you a grounded fix.
              </p>

              {/* CTAs */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    href="#analyzer"
                    className="btn-primary group min-h-[46px] px-7 text-sm font-semibold shadow-glow-emerald"
                  >
                    <span>Analyze a log now</span>
                    <ArrowRight
                      className="w-4 h-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </a>

                  <Link
                    href="/app"
                    className="btn-ghost min-h-[46px] px-7 text-sm font-medium hover:border-accent"
                  >
                    <span>Launch live demo</span>
                    <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
                  </Link>
                </div>

                {/* Developer micro guarantee */}
                <div className="flex items-center gap-4 text-[11px] font-mono text-muted pt-1">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                    Deterministic Rules
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                    100% Secret Redaction
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                    Zero Signup
                  </span>
                </div>
              </div>

              {/* Trust Metrics Strip: Polished Glass Tiles */}
              <div
                ref={metricsRef}
                className="pt-6 border-t border-border/40 grid grid-cols-3 gap-3 sm:gap-4 text-left max-w-xl"
              >
                <div className="glass-panel p-3.5 sm:p-4 border border-border/60 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Engine</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  </div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-text font-mono">
                    {hasCounted ? `${counts.rules}+` : '26+'}
                  </div>
                  <div className="text-[11px] text-muted">Rules Classified</div>
                </div>

                <div className="glass-panel p-3.5 sm:p-4 border border-border/60 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Privacy</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                  </div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-accent font-mono">
                    {hasCounted ? `${counts.secrets}%` : '100%'}
                  </div>
                  <div className="text-[11px] text-muted">Secrets Redacted</div>
                </div>

                <div className="glass-panel p-3.5 sm:p-4 border border-border/60 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-muted">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Access</span>
                    <Sparkles className="w-3.5 h-3.5 text-[#7DC4FF]" aria-hidden="true" />
                  </div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-[#7DC4FF] font-mono">
                    0 Login
                  </div>
                  <div className="text-[11px] text-muted">Instant Live Seed</div>
                </div>
              </div>
            </div>

            {/* Right Column: Live Pipeline Visual */}
            <div className="lg:col-span-5 w-full">
              <PipelineVisual />
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4a: WORKS WITH YOUR STACK                         */}
        {/* ========================================================= */}
        <section
          aria-labelledby="stack-heading"
          className="py-8 px-6 max-w-7xl mx-auto w-full border-y border-border/30"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="text-xs font-mono uppercase tracking-wider text-muted font-semibold" id="stack-heading">
              Built natively for modern CI & AI stacks
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border/60 text-xs text-text font-mono">
                <Workflow className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                <span>GitHub Actions</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border/60 text-xs text-text font-mono">
                <Database className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                <span>MongoDB Atlas</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border/60 text-xs text-text font-mono">
                <Sparkles className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                <span>Google Gemini</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border/60 text-xs text-text font-mono">
                <Cpu className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                <span>n8n Webhooks</span>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4b: BEFORE VS AFTER COMPARISON                    */}
        {/* ========================================================= */}
        <section
          aria-labelledby="comparison-heading"
          className="py-20 px-6 max-w-7xl mx-auto w-full"
        >
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="section-eyebrow justify-center">Engineered For Developer Speed</span>
            <h2 id="comparison-heading" className="font-display text-3xl sm:text-4xl font-bold text-text">
              20 minutes of log scrolling vs. <br className="hidden sm:inline" />
              <span className="gradient-text">2 seconds to root cause.</span>
            </h2>
            <p className="text-sm text-muted">
              CI test suites produce thousands of lines of noisy output. Origin cuts through the chaos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {/* Without Origin */}
            <div className="glass-panel p-6 sm:p-7 border border-danger/25 relative overflow-hidden space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2 text-danger font-semibold text-sm">
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Without Origin</span>
                </div>
                <span className="text-[11px] font-mono text-muted">~20 min wasted</span>
              </div>

              <div className="rounded-xl bg-[#030605] border border-border/30 p-3.5 font-mono text-xs text-muted/80 space-y-2 opacity-80 select-none">
                <div className="text-muted/50 text-[10px]">2,148 lines of raw CI output...</div>
                <div className="truncate">npm ERR! code 1 at child_process.js:188:12</div>
                <div className="truncate">at Module._compile (internal/modules/cjs/loader.js:956:30)</div>
                <div className="text-danger/90 truncate bg-danger/10 px-2 py-1 rounded">
                  ERROR: build failed. Scroll up 800 lines to find why.
                </div>
                <div className="text-muted/40 text-[10px]">Unredacted JWT tokens dumped in stack trace...</div>
              </div>

              <ul className="space-y-2 text-xs text-muted pt-1">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-hidden="true" />
                  <span>2,000+ lines of raw console noise and ANSI escape codes</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-hidden="true" />
                  <span>Secrets & auth credentials accidentally leaked in terminal</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-hidden="true" />
                  <span>Engineers guessing which commit broke main</span>
                </li>
              </ul>
            </div>

            {/* With Origin */}
            <div className="glass-panel p-6 sm:p-7 border border-accent/40 relative overflow-hidden space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2 text-accent font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>With Origin</span>
                </div>
                <span className="chip text-[11px] py-0.5 px-2">Sub-2s resolution</span>
              </div>

              <div className="rounded-xl bg-[#040806] border border-border p-3.5 font-mono text-xs space-y-2 select-none shadow-inner">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-accent font-bold">Rule: npm-lock-out-of-sync</span>
                  <span className="text-muted text-[10px]">Confidence: 100%</span>
                </div>
                <div className="text-xs text-text bg-accent-soft/20 p-2 rounded border border-border/50">
                  Root Cause: Package.json was updated without syncing package-lock.json.
                </div>
                <div className="text-emerald-400 font-mono text-[11px] truncate">
                  $ npm install && git commit -m &quot;sync lockfile&quot;
                </div>
              </div>

              <ul className="space-y-2 text-xs text-text pt-1">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                  <span>Deterministic diagnosis with exact cited log line citations</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                  <span>100% pre-ingestion secret redaction (PATs, AWS keys, URIs)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                  <span>Suspect commit ranked by touched files + flaky detection</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4c: INSTANT ANALYZER                              */}
        {/* ========================================================= */}
        <section
          aria-labelledby="analyzer-section-heading"
          className="py-16 px-6 max-w-7xl mx-auto w-full"
        >
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="section-eyebrow justify-center">Interactive Playground</span>
            <h2 id="analyzer-section-heading" className="font-display text-3xl sm:text-4xl font-bold text-text">
              Try the Deterministic Engine
            </h2>
            <p className="text-sm text-muted">
              Test Origin live on genuine failure signatures without signing up or connecting a repository.
            </p>
          </div>

          <InstantAnalyzer />
        </section>

        {/* ========================================================= */}
        {/* SECTION 4d: HOW IT WORKS (3-STEP WITH CONNECTORS)         */}
        {/* ========================================================= */}
        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="py-20 px-6 max-w-7xl mx-auto w-full"
        >
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="section-eyebrow justify-center">Autonomous Architecture</span>
            <h2 id="how-it-works-heading" className="font-display text-3xl sm:text-4xl font-bold text-text">
              Deterministic Engine First, <br className="hidden sm:inline" />
              Agentic AI Second.
            </h2>
            <p className="text-sm text-muted">
              The LLM never guesses whether a build failed. Deterministic rules establish facts; agents correlate history, suspect files, and remediation patches.
            </p>
          </div>

          {/* 3 Steps with Responsive Connecting Line */}
          <div className="relative max-w-5xl mx-auto">
            {/* Desktop Connecting Line */}
            <div
              className="hidden md:block absolute top-12 left-1/6 right-1/6 h-[2px] bg-gradient-to-r from-accent/20 via-accent/50 to-accent/20 pointer-events-none z-0"
              aria-hidden="true"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
              {/* Step 1 */}
              <div className="glass-panel p-6 sm:p-7 space-y-4 glass-panel-hover flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent">
                      <Lock className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <span className="text-2xl font-mono font-bold text-accent/40">01</span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-text">Cleanse & Redact</h3>
                  <p className="text-xs sm:text-sm text-muted leading-relaxed">
                    Strips ANSI garbage, normalizes ISO timestamps, and redacts GitHub PATs, AWS credentials, and connection strings before storage or LLM processing.
                  </p>
                </div>
                <div className="pt-4 border-t border-white/5 text-[11px] font-mono text-accent">
                  ✓ Pre-ingestion zero-trust
                </div>
              </div>

              {/* Step 2 */}
              <div className="glass-panel p-6 sm:p-7 space-y-4 glass-panel-hover flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent">
                      <Cpu className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <span className="text-2xl font-mono font-bold text-accent/40">02</span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-text">Deterministic Classifier</h3>
                  <p className="text-xs sm:text-sm text-muted leading-relaxed">
                    Evaluates 26+ deterministic rules across 7 failure categories. Generates verifiable sha256 signatures from concrete cited error lines.
                  </p>
                </div>
                <div className="pt-4 border-t border-white/5 text-[11px] font-mono text-accent">
                  ✓ 100% evidence-grounded
                </div>
              </div>

              {/* Step 3 */}
              <div className="glass-panel p-6 sm:p-7 space-y-4 glass-panel-hover flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent">
                      <GitCommit className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <span className="text-2xl font-mono font-bold text-accent/40">03</span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-text">Suspects & Flake Math</h3>
                  <p className="text-xs sm:text-sm text-muted leading-relaxed">
                    Scores suspect commits touching failed files (+3/+2/+1) and mathematically distinguishes consistent breakages from flaky same-SHA flips.
                  </p>
                </div>
                <div className="pt-4 border-t border-white/5 text-[11px] font-mono text-accent">
                  ✓ Patch synthesis & verification
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4e: WHY DEVELOPERS TRUST IT                       */}
        {/* ========================================================= */}
        <section
          aria-labelledby="trust-heading"
          className="py-16 px-6 max-w-7xl mx-auto w-full"
        >
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="section-eyebrow justify-center">Reliability Engineering</span>
            <h2 id="trust-heading" className="font-display text-3xl sm:text-4xl font-bold text-text">
              Why Developers Trust Origin
            </h2>
            <p className="text-sm text-muted">
              Built by developers who are tired of hallucinations and insecure AI tools in production pipelines.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Feature 1 */}
            <div className="glass-panel p-6 space-y-3 glass-panel-hover">
              <div className="w-10 h-10 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent mb-2">
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-text">Deterministic Rules First</h3>
              <p className="text-xs text-muted leading-relaxed">
                The LLM never decides whether a build failed. Over 26 exact rules evaluate log signatures, exit codes, and dependency conflicts before any agent prompt is constructed.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-panel p-6 space-y-3 glass-panel-hover">
              <div className="w-10 h-10 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent mb-2">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-text">Secrets Redacted Everywhere</h3>
              <p className="text-xs text-muted leading-relaxed">
                All logs pass through multi-pattern regex sanitizer scrubbers before hitting the database or AI context. PATs, AWS keys, Stripe secrets, and URIs never leak.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-panel p-6 space-y-3 glass-panel-hover">
              <div className="w-10 h-10 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent mb-2">
                <Activity className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-text">Same-SHA Flaky Detection</h3>
              <p className="text-xs text-muted leading-relaxed">
                Origin tracks test pass/fail transitions on the same git commit SHA. If a test fails and later passes without new code, Origin scores it as a flaky run.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4f: FAQ (NATIVE DETAILS & SUMMARY)                */}
        {/* ========================================================= */}
        <section
          aria-labelledby="faq-heading"
          className="py-16 px-6 max-w-4xl mx-auto w-full"
        >
          <div className="text-center mb-12 space-y-2">
            <span className="section-eyebrow justify-center">Frequently Asked Questions</span>
            <h2 id="faq-heading" className="font-display text-3xl sm:text-4xl font-bold text-text">
              Everything You Need to Know
            </h2>
          </div>

          <div className="space-y-4">
            <details className="group glass-panel p-5 border border-border/60 transition-all rounded-xl open:border-accent/40">
              <summary className="flex items-center justify-between font-display font-semibold text-text cursor-pointer list-none min-h-[32px] focus-visible:ring-2 focus-visible:ring-accent rounded-md">
                <span className="text-sm sm:text-base">What is Origin?</span>
                <ChevronDown className="w-4 h-4 text-muted group-open:rotate-180 transition-transform duration-200" aria-hidden="true" />
              </summary>
              <div className="mt-3 text-xs sm:text-sm text-muted leading-relaxed pt-2 border-t border-border/30">
                Origin is an agentic CI failure investigator built for developer platforms. When a workflow fails, Origin ingests the raw logs, redacts secrets, executes deterministic classification rules, scores suspect commits based on touched files, and synthesizes a verified remediation patch.
              </div>
            </details>

            <details className="group glass-panel p-5 border border-border/60 transition-all rounded-xl open:border-accent/40">
              <summary className="flex items-center justify-between font-display font-semibold text-text cursor-pointer list-none min-h-[32px] focus-visible:ring-2 focus-visible:ring-accent rounded-md">
                <span className="text-sm sm:text-base">Do I need to log in to try it?</span>
                <ChevronDown className="w-4 h-4 text-muted group-open:rotate-180 transition-transform duration-200" aria-hidden="true" />
              </summary>
              <div className="mt-3 text-xs sm:text-sm text-muted leading-relaxed pt-2 border-t border-border/30">
                No. You can test the Instant Analyzer directly on this page with one click. Additionally, our live dashboard contains pre-seeded GitHub failure runs and historical flake data ready for instant exploration.
              </div>
            </details>

            <details className="group glass-panel p-5 border border-border/60 transition-all rounded-xl open:border-accent/40">
              <summary className="flex items-center justify-between font-display font-semibold text-text cursor-pointer list-none min-h-[32px] focus-visible:ring-2 focus-visible:ring-accent rounded-md">
                <span className="text-sm sm:text-base">Is my log data safe from leaking?</span>
                <ChevronDown className="w-4 h-4 text-muted group-open:rotate-180 transition-transform duration-200" aria-hidden="true" />
              </summary>
              <div className="mt-3 text-xs sm:text-sm text-muted leading-relaxed pt-2 border-t border-border/30">
                Yes. Origin executes pre-ingestion redaction before logs are stored in MongoDB Atlas or submitted to LLM APIs. Secrets such as GitHub Personal Access Tokens, AWS credentials, JWTs, Stripe keys, and database connection URIs are scrubbed with block symbols (<code className="text-accent font-mono">████</code>).
              </div>
            </details>

            <details className="group glass-panel p-5 border border-border/60 transition-all rounded-xl open:border-accent/40">
              <summary className="flex items-center justify-between font-display font-semibold text-text cursor-pointer list-none min-h-[32px] focus-visible:ring-2 focus-visible:ring-accent rounded-md">
                <span className="text-sm sm:text-base">How does it detect flaky tests?</span>
                <ChevronDown className="w-4 h-4 text-muted group-open:rotate-180 transition-transform duration-200" aria-hidden="true" />
              </summary>
              <div className="mt-3 text-xs sm:text-sm text-muted leading-relaxed pt-2 border-t border-border/30">
                Origin tracks test run outcomes grouped by the exact git commit SHA. If a test run fails on a commit SHA, and subsequent runs on the exact same commit pass without code changes, Origin calculates a flaky probability score, isolating intermittent networking or timing issues from genuine code regressions.
              </div>
            </details>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 4g: FINAL CTA BAND                                */}
        {/* ========================================================= */}
        <section
          aria-labelledby="cta-band-heading"
          className="py-20 px-6 max-w-7xl mx-auto w-full"
        >
          <div className="glass-panel p-8 sm:p-14 border border-accent/30 text-center relative overflow-hidden rounded-3xl shadow-2xl">
            {/* Ambient inner glow */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/15 rounded-full blur-[100px] pointer-events-none"
              aria-hidden="true"
            />

            <div className="relative z-10 max-w-2xl mx-auto space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full chip text-xs font-mono font-medium">
                <span>Autonomous CI Intelligence</span>
              </div>

              <h2
                id="cta-band-heading"
                className="font-display text-3xl sm:text-5xl font-bold text-text tracking-tight"
              >
                Stop scrolling logs. <br />
                <span className="gradient-text">Start fixing.</span>
              </h2>

              <p className="text-sm sm:text-base text-muted max-w-xl mx-auto leading-relaxed">
                Connect your GitHub repository or test a failure log instantly to eliminate hours of painful CI debugging.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <a
                  href="#analyzer"
                  className="btn-primary min-h-[44px] px-7 text-sm font-semibold"
                >
                  <span>Analyze a log now</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>

                <Link
                  href="/app"
                  className="btn-ghost min-h-[44px] px-7 text-sm font-medium"
                >
                  <span>Launch live demo</span>
                  <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================= */}
      {/* SECTION 4h: SEMANTIC FOOTER                               */}
      {/* ========================================================= */}
      <footer className="mt-auto border-t border-border/40 py-10 px-6 text-xs text-muted bg-bg-elevated/40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
            <div className="flex items-center gap-2 font-display font-bold text-sm text-text">
              <Terminal className="w-4 h-4 text-accent" aria-hidden="true" />
              <span>Origin</span>
            </div>
            <span className="hidden sm:inline text-border">•</span>
            <span>Agentic CI Failure Investigator</span>
            <span className="hidden sm:inline text-border">•</span>
            <span className="text-accent/90">Built for UNCHARTED 2026</span>
          </div>

          <nav aria-label="Footer Navigation" className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium">
            <a href="#how-it-works" className="hover:text-accent transition-colors min-h-[32px] flex items-center">
              How it works
            </a>
            <a href="#analyzer" className="hover:text-accent transition-colors min-h-[32px] flex items-center">
              Analyzer
            </a>
            <Link href="/app" className="hover:text-accent transition-colors min-h-[32px] flex items-center">
              Dashboard
            </Link>
            <Link href="/app/flaky" className="hover:text-accent transition-colors min-h-[32px] flex items-center">
              Flaky Tests
            </Link>
            <a
              href="https://github.com/Komeka71/Uncharted"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text transition-colors min-h-[32px] flex items-center gap-1.5"
            >
              <span>GitHub</span>
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
