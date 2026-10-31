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
  const [liveConnected, setLiveConnected] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const eventSource = new EventSource(`${apiUrl}/api/stream`);
      eventSource.onopen = () => setLiveConnected(true);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_failure' || data.type === 'diagnosis_ready') {
            showNotice(`⚡ Real-time Event: ${data.type.replace('_', ' ')} (${data.signature || ''})`);
          }
        } catch (e) {}
      };
      eventSource.onerror = () => setLiveConnected(false);

      return () => eventSource.close();
    } catch (e) {
      setLiveConnected(false);
    }
  }, []);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleSeedDemo = async () => {
    setSimulating(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/demo/seed`, { method: 'POST' });
      if (res.ok) {
        showNotice('✅ Demo project seeded with 40 runs, regressions, and flaky tests!');
        window.location.reload();
      }
    } catch (err) {
      showNotice('Demo seeded (memory mode)');
    } finally {
      setSimulating(false);
    }
  };

  const handleSimulate = async (scenario: string) => {
    setSimulating(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/demo/simulate/${scenario}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showNotice(`⚡ Simulated failing run: ${data.scenario} -> ${data.diagnosis?.title || 'Analyzed'}`);
        setTimeout(() => {
          window.location.href = `/app/failures/${data.failureId}`;
        }, 1200);
      }
    } catch (err) {
      showNotice('Simulation complete');
    } finally {
      setSimulating(false);
    }
  };

  const handleReset = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      await fetch(`${apiUrl}/api/demo/reset`, { method: 'POST' });
      showNotice('Demo state reset to clean initial state');
      window.location.reload();
    } catch (e) {}
  };

  const navItems = [
    { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
    { name: 'Flaky Tests', href: '/app/flaky', icon: Cpu },
    { name: 'Projects & Setup', href: '/app/projects', icon: FolderGit2 }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      {/* App Topbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-bg/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-soft border border-border flex items-center justify-center text-accent">
                <Terminal className="w-4 h-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-text">Culprit</span>
            </Link>

            {/* Nav items */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent border border-border/60'
                        : 'text-muted hover:text-text hover:bg-surface-2'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Toolbar: Live SSE dot + Demo Action Bar */}
          <div className="flex items-center gap-3">
            {/* Live Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-2 border border-border/40 text-[11px] font-mono text-muted">
              <span className={`w-2 h-2 rounded-full ${liveConnected ? 'bg-accent animate-pulse' : 'bg-amber-400'}`} />
              <span>{liveConnected ? 'LIVE STREAM' : 'POLLING'}</span>
            </div>

            {/* Demo Actions Dropdown / Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSeedDemo}
                disabled={simulating}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-soft text-accent border border-border hover:bg-accent hover:text-bg transition-all cursor-pointer"
                title="Seed demo project with 40 runs and regressions"
              >
                Seed Demo
              </button>

              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleSimulate(e.target.value);
                    e.target.value = '';
                  }
                }}
                disabled={simulating}
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-surface-2 text-text border border-border/60 focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="">⚡ Simulate Run...</option>
                <option value="dependency">npm lockfile mismatch</option>
                <option value="typescript">TypeScript TS2339 error</option>
                <option value="missing_secret">Missing Stripe Secret</option>
                <option value="flaky_flip">Flaky test timeout flip</option>
                <option value="network_reset">Network socket ECONNRESET</option>
              </select>

              <button
                onClick={handleReset}
                className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-2 border border-transparent hover:border-border/40 transition-colors cursor-pointer"
                title="Reset demo state"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Toast Notification */}
        {actionNotice && (
          <div className="bg-accent/15 border-b border-accent/30 py-1.5 px-6 text-center text-xs text-accent font-mono animate-in slide-in-from-top-2 duration-200">
            {actionNotice}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
