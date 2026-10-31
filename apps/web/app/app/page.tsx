'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  TrendingDown,
  Repeat,
  Cpu,
  Clock,
  ArrowRight,
  ShieldAlert,
  GitBranch,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [failures, setFailures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      try {
        const [statsRes, failuresRes] = await Promise.all([
          fetch(`${apiUrl}/api/stats/overview?projectId=demo-shop`),
          fetch(`${apiUrl}/api/failures?projectId=demo-shop`)
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
        if (failuresRes.ok) {
          const failuresData = await failuresRes.json();
          setFailures(failuresData.failures || []);
        }
      } catch (err) {
        console.warn('Dashboard fetch fallback:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const kpis = stats?.kpis || {
    totalFailures7d: 14,
    recurringRatePct: 42,
    flakyTestsCount: 3,
    mttrHours: 2.1
  };

  const chartData = (stats?.categoryTrends || [
    { date: '10/25', total: 3 },
    { date: '10/26', total: 4 },
    { date: '10/27', total: 2 },
    { date: '10/28', total: 5 },
    { date: '10/29', total: 3 },
    { date: '10/30', total: 4 },
    { date: '10/31', total: 2 }
  ]).map((d: any) => ({
    name: d.date.split('-').slice(1).join('/') || d.date,
    failures: d.total
  }));

  const topRecurring = stats?.topRecurring || [
    {
      signature: 'a7b9c1d2e3f4051a',
      category: 'dependency',
      ruleId: 'npm-lock-out-of-sync',
      count: 6,
      status: 'open',
      sampleEvidence: 'npm ci can only install packages when your package.json and package-lock.json are in sync.'
    },
    {
      signature: 'f4e3d2c1b0a98765',
      category: 'build_compile',
      ruleId: 'ts-compile-error',
      count: 4,
      status: 'regressed',
      sampleEvidence: "src/services/authService.ts: error TS2339: Property 'role' does not exist"
    }
  ];

  const categoryColors: Record<string, string> = {
    dependency: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    build_compile: 'text-red-400 bg-red-400/10 border-red-400/30',
    test_failure: 'text-rose-400 bg-rose-400/10 border-rose-400/30',
    config_env: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
    docker_container: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
    network_transient: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    infra_runner: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
    lint_format: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner with Project Context */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text">CI Failure Intelligence</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent border border-border font-mono font-medium">
              culprit-ci/culprit-demo-shop
            </span>
          </div>
          <p className="text-xs text-muted mt-1">Autonomous failure investigation, signature recurrence, and suspect commits.</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/app/projects"
            className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/40 text-text transition-colors flex items-center gap-1.5"
          >
            <GitBranch className="w-3.5 h-3.5 text-muted" />
            <span>Project Settings</span>
          </Link>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* KPI 1 */}
        <div className="glass-panel p-5 space-y-2">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Failures (7d)</span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-text">
            {kpis.totalFailures7d}
          </div>
          <div className="text-[11px] text-muted flex items-center gap-1">
            <span className="text-red-400 font-semibold font-mono">14</span> across 3 workflows
          </div>
        </div>

        {/* KPI 2 */}
        <div className="glass-panel p-5 space-y-2">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Recurrence Rate</span>
            <Repeat className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
            {kpis.recurringRatePct}%
          </div>
          <div className="text-[11px] text-muted">
            Identical recurring signatures
          </div>
        </div>

        {/* KPI 3 */}
        <div className="glass-panel p-5 space-y-2">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Flaky Tests</span>
            <Cpu className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-accent">
            {kpis.flakyTestsCount}
          </div>
          <div className="text-[11px] text-muted flex items-center gap-1">
            <Link href="/app/flaky" className="text-accent hover:underline flex items-center gap-0.5">
              <span>View quarantine</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="glass-panel p-5 space-y-2">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-medium">Average MTTR</span>
            <Clock className="w-4 h-4 text-[#5BB8FF]" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#5BB8FF]">
            {kpis.mttrHours}h
          </div>
          <div className="text-[11px] text-muted">
            Time to subsequent green run
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left Failures List, Right Top Recurring & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Recent Failures List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text uppercase tracking-wider font-mono">
              Recent Analyzed Failures
            </h2>
            <span className="text-xs text-muted font-mono">{failures.length} recorded</span>
          </div>

          <div className="space-y-3">
            {failures.length > 0 ? (
              failures.map((f) => (
                <Link
                  key={f.failureId}
                  href={`/app/failures/${f.failureId}`}
                  className="block glass-panel p-4 glass-panel-hover group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded border font-mono font-semibold uppercase ${
                            categoryColors[f.category] || 'text-muted bg-surface-2 border-border/40'
                          }`}
                        >
                          {f.category}
                        </span>

                        <span className="text-xs font-mono font-bold text-text truncate group-hover:text-accent transition-colors">
                          {f.ruleId}
                        </span>

                        {f.isRegression && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-mono font-bold animate-pulse">
                            ⚠️ REGRESSION
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-text/80 truncate font-sans">
                        {f.summary || f.ruleId}
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-muted font-mono pt-1">
                        <span>Sig: <strong className="text-accent">{f.signature}</strong></span>
                        <span>Seen {f.occurrences}x</span>
                        <span>Job: {f.jobName}</span>
                      </div>
                    </div>

                    <div className="text-right text-muted group-hover:text-accent transition-colors">
                      <ArrowRight className="w-4 h-4 ml-auto" />
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="glass-panel p-8 text-center space-y-3">
                <ShieldAlert className="w-8 h-8 text-muted mx-auto" />
                <div className="text-sm font-bold text-text">No Failures Ingested Yet</div>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  Click <strong>&quot;Seed Demo&quot;</strong> in the top bar to populate 40 realistic runs or simulate a failing commit.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Top Recurring (A1) and Trends Chart (A2) (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Top Recurring Failures (Aggregation A1) */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-text uppercase font-mono tracking-wider">
                Top Recurring Failures (A1)
              </h3>
              <span className="text-[10px] text-muted font-mono">Last 7 Days</span>
            </div>

            <div className="space-y-3">
              {topRecurring.map((item: any) => (
                <div
                  key={item.signature}
                  className="p-3 rounded-xl bg-surface-2 border border-border/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-text">
                      {item.ruleId}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                      {item.count} occurrences
                    </span>
                  </div>

                  <div className="text-[11px] text-muted truncate font-mono">
                    {item.sampleEvidence || item.signature}
                  </div>

                  {item.status === 'regressed' && (
                    <div className="text-[10px] text-red-400 font-mono flex items-center gap-1 font-semibold">
                      <span>⚠️ Regressed after being marked fixed</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Daily Failure Trend Chart (Aggregation A2) */}
          <div className="glass-panel p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-text uppercase font-mono tracking-wider">
                Daily Failure Trend (A2)
              </h3>
              <span className="text-[10px] text-muted font-mono">14 Days</span>
            </div>

            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#8AA394" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8AA394" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#040806',
                      borderColor: 'rgba(43,227,127,0.3)',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#E8F5EC'
                    }}
                  />
                  <Bar dataKey="failures" radius={[4, 4, 0, 0]}>
                    {chartData.map((_entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#2BE37F' : 'rgba(43,227,127,0.45)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
