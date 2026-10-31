'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Terminal, Sparkles, Github, Menu, X, ArrowRight } from 'lucide-react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);

      // Simple active section spy for landing page anchors
      const howItWorks = document.getElementById('how-it-works');
      const analyzer = document.getElementById('analyzer');
      const scrollPos = window.scrollY + 200;

      if (analyzer && scrollPos >= analyzer.offsetTop) {
        setActiveSection('analyzer');
      } else if (howItWorks && scrollPos >= howItWorks.offsetTop) {
        setActiveSection('how-it-works');
      } else {
        setActiveSection('');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard navigation: Escape closes mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        scrolled
          ? 'bg-bg/90 backdrop-blur-xl border-b border-border shadow-lg shadow-black/20'
          : 'bg-bg/60 backdrop-blur-md border-b border-border/40'
      }`}
    >
      <nav aria-label="Main navigation" className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-3 group rounded-lg focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Origin Home"
        >
          <div className="w-9 h-9 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent shadow-glow-sm group-hover:scale-105 transition-transform">
            <Terminal className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-lg tracking-tight text-text">Origin</span>
            <span className="chip text-[11px] font-mono py-0.5 px-2">CI Agent</span>
          </div>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-7 text-sm">
          <a
            href="#how-it-works"
            className={`min-h-[44px] flex items-center transition-colors px-1 border-b-2 ${
              activeSection === 'how-it-works'
                ? 'text-accent border-accent font-medium'
                : 'text-muted border-transparent hover:text-text'
            }`}
          >
            How it works
          </a>
          <a
            href="#analyzer"
            className={`min-h-[44px] flex items-center transition-colors px-1 border-b-2 ${
              activeSection === 'analyzer'
                ? 'text-accent border-accent font-medium'
                : 'text-muted border-transparent hover:text-text'
            }`}
          >
            Instant Analyzer
          </a>
          <Link
            href="/app"
            className="min-h-[44px] flex items-center text-muted hover:text-text transition-colors px-1"
          >
            Dashboard
          </Link>
          <Link
            href="/app/flaky"
            className="min-h-[44px] flex items-center text-muted hover:text-text transition-colors px-1"
          >
            Flaky Tests
          </Link>
          <a
            href="https://github.com/Komeka71/Uncharted"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] flex items-center gap-1.5 text-muted hover:text-text transition-colors px-1"
            aria-label="GitHub Repository (opens in new tab)"
          >
            <Github className="w-4 h-4" aria-hidden="true" />
            <span>GitHub</span>
          </a>
        </div>

        {/* Desktop CTAs */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/app"
            className="btn-primary py-2 px-4.5 text-xs font-semibold"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Dashboard</span>
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/app"
            className="btn-primary py-1.5 px-3 text-xs sm:hidden"
          >
            <span>Dashboard</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-surface-2 border border-border text-text hover:text-accent focus-visible:ring-2 focus-visible:ring-accent transition-colors"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          className="md:hidden fixed inset-x-0 top-16 bg-bg/95 backdrop-blur-2xl border-b border-border shadow-2xl p-6 transition-all duration-200 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto"
        >
          <div className="flex flex-col gap-2">
            <a
              href="#how-it-works"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between min-h-[44px] px-3 rounded-lg text-sm text-text hover:bg-surface-2 hover:text-accent transition-colors"
            >
              <span>How it works</span>
              <ArrowRight className="w-4 h-4 text-muted" aria-hidden="true" />
            </a>
            <a
              href="#analyzer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between min-h-[44px] px-3 rounded-lg text-sm text-text hover:bg-surface-2 hover:text-accent transition-colors"
            >
              <span>Instant Analyzer</span>
              <ArrowRight className="w-4 h-4 text-muted" aria-hidden="true" />
            </a>
            <Link
              href="/app"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between min-h-[44px] px-3 rounded-lg text-sm text-text hover:bg-surface-2 hover:text-accent transition-colors"
            >
              <span>Dashboard</span>
              <ArrowRight className="w-4 h-4 text-muted" aria-hidden="true" />
            </Link>
            <Link
              href="/app/flaky"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between min-h-[44px] px-3 rounded-lg text-sm text-text hover:bg-surface-2 hover:text-accent transition-colors"
            >
              <span>Flaky Tests</span>
              <ArrowRight className="w-4 h-4 text-muted" aria-hidden="true" />
            </Link>
            <a
              href="https://github.com/Komeka71/Uncharted"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between min-h-[44px] px-3 rounded-lg text-sm text-muted hover:bg-surface-2 hover:text-text transition-colors"
            >
              <div className="flex items-center gap-2">
                <Github className="w-4 h-4" aria-hidden="true" />
                <span>GitHub Repository</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted" aria-hidden="true" />
            </a>

            <div className="pt-4 mt-2 border-t border-border/40">
              <Link
                href="/app"
                onClick={() => setMobileOpen(false)}
                className="btn-primary w-full justify-center min-h-[44px]"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Open Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
