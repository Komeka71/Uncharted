'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Terminal, Sparkles, ArrowRight, Github } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-bg/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent shadow-glow-sm group-hover:scale-105 transition-transform">
            <Terminal className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-text">Culprit</span>
            <span className="text-xs px-2 py-0.5 rounded-full badge-glow font-mono font-medium">CI Agent</span>
          </div>
        </Link>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8 text-sm text-muted">
          <a href="#how-it-works" className="hover:text-accent transition-colors">How it works</a>
          <a href="#analyzer" className="hover:text-accent transition-colors">Instant Analyzer</a>
          <Link href="/app" className="hover:text-accent transition-colors">Dashboard</Link>
          <Link href="/app/flaky" className="hover:text-accent transition-colors">Flaky Tests</Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-text transition-colors"
          >
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </a>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-bg bg-accent hover:bg-[#34f38b] transition-all shadow-glow-sm hover:shadow-glow-emerald"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Open Dashboard</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
