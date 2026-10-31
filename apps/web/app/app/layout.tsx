'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Terminal,
  LayoutDashboard,
  Cpu,
  FolderGit2,
  Play,
  RotateCcw,
  Sparkles,
  Radio,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [liveConnected, setLiveConnected] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const eventSource = new EventSource(`${apiUrl}/api/stream`);
    const refreshDashboard = (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        window.dispatchEvent(new Event('culprit:dashboard-refresh'));
        showNotice(`Real-time event: ${data.type || event.type}${data.signature ? ` (${data.signature})` : ''}`);
      } catch (error) {
        console.error('[SSE] Could not process update:', error);
      }
    };

    eventSource.onopen = () => setLiveConnected(true);
    eventSource.onmessage = () => setLiveConnected(true);
    eventSource.addEventListener('new_failure', refreshDashboard);
    eventSource.addEventListener('diagnosis_ready', refreshDashboard);
    eventSource.onerror = () => setLiveConnected(false);

    return () => {
      eventSource.removeEventListener('new_failure', refreshDashboard);
      eventSource.removeEventListener('diagnosis_ready', refreshDashboard);
      eventSource.close();
    };
  }, []);

  const showNotice = (msg: string, isError = false) => {
    setActionNotice(msg);
    setNoticeIsError(isError);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/demo/seed`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Seeding failed with status ${res.status}`);
      }
      showNotice(data.message || 'Demo data is ready.');
      window.dispatchEvent(new Event('culprit:dashboard-refresh'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to seed demo data.';
      showNotice(message, true);
    } finally {
      setSeeding(false);
    }
  };

  const handleSimulate = async (scenario: string) => {
    setSimulating(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/demo/simulate/${scenario}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Simulation failed with status ${res.status}`);
      }
      showNotice(`Simulated failing run: ${data.scenario} -> ${data.diagnosis?.title || 'Analyzed'}`);
      setTimeout(() => {
        window.location.href = `/app/failures/${data.failureId}`;
      }, 1200);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to simulate run.', true);
    } finally {
      setSimulating(false);
    }
  };

  const handleReset = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/demo/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Reset failed with status ${res.status}`);
      }
      showNotice(data.message || 'Demo state reset.');
      window.location.reload();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to reset demo data.', true);
    }
  };

  const navItems = [
    { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
    { name: 'Flaky Tests', href: '/app/flaky', icon: Cpu },
    { name: 'Projects & Setup', href: '/app/projects', icon: FolderGit2 }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text ambient-grid relative selection:bg-accent/30 selection:text-text">
      {/* Background ambient radial glow */}
      <div
        className="absolute top-10 left-1/3 w-[500px] h-[500px] bg-accent/6 rounded-full blur-[140px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute top-80 right-1/4 w-[400px] h-[400px] bg-teal-500/5 rounded-full blur-[140px] pointer-events-none"
        aria-hidden="true"
      />

      {/* App Topbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-bg/90 backdrop-blur-2xl shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
              aria-label="Origin Home"
            >
              <div className="w-8 h-8 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent shadow-glow-sm group-hover:scale-105 transition-transform">
                <Terminal className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-base tracking-tight text-text">Origin</span>
                <span className="chip text-[10px] font-mono py-0.5 px-2">CI Platform</span>
              </div>
            </Link>

            {/* Nav items */}
            <nav aria-label="Dashboard navigation" className="hidden md:flex items-center gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? 'bg-accent-soft text-accent border border-border font-semibold shadow-sm'
                        : 'text-muted hover:text-text hover:bg-surface-2 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Toolbar: Live SSE dot + Demo Action Bar */}
          <div className="flex items-center gap-3">
            {/* Live Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 border border-border/50 text-[11px] font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  liveConnected ? 'bg-accent animate-pulse' : 'bg-warn'
                }`}
                aria-hidden="true"
              />
              <span className={liveConnected ? 'text-accent font-semibold' : 'text-muted'}>
                {liveConnected ? 'LIVE SSE' : 'POLLING'}
              </span>
            </div>

            {/* Demo Actions Dropdown / Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seeding || simulating}
                aria-busy={seeding}
                className="btn-primary min-h-[36px] py-1.5 px-3.5 text-xs font-semibold cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-wait"
                title="Seed persisted demo runs, failures, and test results"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{seeding ? 'Seeding...' : 'Seed Demo'}</span>
              </button>

              <select
                aria-label="Simulate CI failure scenario"
                onChange={(e) => {
                  if (e.target.value) {
                    handleSimulate(e.target.value);
                    e.target.value = '';
                  }
                }}
                disabled={simulating || seeding}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 text-text border border-border/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent cursor-pointer min-h-[36px]"
              >
                <option value="">⚡ Simulate Run...</option>
                <option value="dependency">npm lockfile mismatch</option>
                <option value="typescript">TypeScript TS2339 error</option>
                <option value="missing_secret">Missing Stripe Secret</option>
                <option value="flaky_flip">Flaky test timeout flip</option>
                <option value="network_reset">Network socket ECONNRESET</option>
              </select>

              <button
                type="button"
                onClick={handleReset}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-2 border border-border/40 hover:border-border transition-colors cursor-pointer"
                title="Reset demo state"
                aria-label="Reset demo state"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Toast Notification */}
        {actionNotice && (
          <div
            role={noticeIsError ? 'alert' : 'status'}
            className={`border-b py-2 px-6 text-center text-xs font-mono animate-in slide-in-from-top-2 duration-200 ${
              noticeIsError
                ? 'bg-danger/15 border-danger/30 text-danger'
                : 'bg-accent/15 border-accent/30 text-accent'
            }`}
          >
            {actionNotice}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 relative z-10">
        {children}
      </main>
    </div>
  );
}
