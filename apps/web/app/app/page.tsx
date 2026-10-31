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
  const [failuresTotal, setFailuresTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      try {
        const [statsRes, failuresRes] = await Promise.all([
          fetch(`${apiUrl}/api/stats/overview?projectId=demo-shop`),
          fetch(`${apiUrl}/api/failures?projectId=demo-shop&days=7&status=analyzed`)
        ]);

        const [statsData, failuresData] = await Promise.all([
          statsRes.json(),
          failuresRes.json()
        ]);
        if (!statsRes.ok || !failuresRes.ok) {
          throw new Error(
            statsData.error?.message ||
            failuresData.error?.message ||
            'Unable to load dashboard data.'
          );
        }
        setStats(statsData);
        setFailures(failuresData.failures || []);
        setFailuresTotal(failuresData.total ?? failuresData.failures?.length ?? 0);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load dashboard data.';
        setError(message);
        console.error('[Dashboard] Data request failed:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
    window.addEventListener('culprit:dashboard-refresh', loadData);
    return () => window.removeEventListener('culprit:dashboard-refresh', loadData);
  }, []);

  const kpis = stats?.kpis;
  const metricValue = (value: number | null | undefined) => (
    loading || error ? '—' : value ?? 0
  );
  const chartData = (stats?.categoryTrends || []).map((d: any) => ({
    name: d.date.split('-').slice(1).join('/') || d.date,
    failures: d.total
  }));
  const hasDailyFailures = chartData.some((day: any) => day.failures > 0);

  const topRecurring = stats?.topRecurring || [];

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text">CI Failure Intelligence</h1>
            <span className="chip text-[11px] py-0.5 px-2.5 font-mono">
              origin-ci/demo-shop
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Autonomous failure investigation, signature recurrence tracking, and suspect commit ranking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/app/projects"
            className="btn-ghost min-h-[38px] py-1.5 px-3.5 text-xs font-medium"
          >
            <GitBranch className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            <span>Project Settings</span>
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="glass-panel border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Dashboard data could not be loaded: {error}
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* KPI 1 */}
        <div className="glass-panel p-5 space-y-2.5 border border-border/60 glass-panel-hover">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-mono uppercase tracking-wider">Failures (7d)</span>
            <div className="w-7 h-7 rounded-lg bg-danger/10 border border-danger/25 flex items-center justify-center text-danger">
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="font-display text-2xl sm:text-3xl font-bold font-mono text-text">
            {metricValue(kpis?.totalFailures7d)}
          </div>
          <div className="text-[11px] text-muted flex items-center gap-1">
            <span className="text-danger font-semibold font-mono">
              {metricValue(kpis?.totalFailures7d)}
            </span>
            {' '}across {metricValue(kpis?.workflowCount)} workflows
          </div>
        </div>

        {/* KPI 2 */}
        <div className="glass-panel p-5 space-y-2.5 border border-border/60 glass-panel-hover">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-mono uppercase tracking-wider">Recurrence Rate</span>
            <div className="w-7 h-7 rounded-lg bg-warn/10 border border-warn/25 flex items-center justify-center text-warn">
              <Repeat className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="font-display text-2xl sm:text-3xl font-bold font-mono text-warn">
            {metricValue(kpis?.recurringRatePct)}%
          </div>
          <div className="text-[11px] text-muted">
            Identical recurring signatures
          </div>
        </div>

        {/* KPI 3 */}
        <div className="glass-panel p-5 space-y-2.5 border border-border/60 glass-panel-hover">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-mono uppercase tracking-wider">Flaky Tests</span>
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center text-accent">
              <Cpu className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="font-display text-2xl sm:text-3xl font-bold font-mono text-accent">
            {metricValue(kpis?.flakyTestsCount)}
          </div>
          <div className="text-[11px] text-muted flex items-center gap-1">
            <Link href="/app/flaky" className="text-accent hover:underline flex items-center gap-1 font-medium">
              <span>View quarantine</span>
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="glass-panel p-5 space-y-2.5 border border-border/60 glass-panel-hover">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-mono uppercase tracking-wider">Average MTTR</span>
            <div className="w-7 h-7 rounded-lg bg-info/10 border border-info/25 flex items-center justify-center text-info">
              <Clock className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="font-display text-2xl sm:text-3xl font-bold font-mono text-info">
            {loading || error ? '—' : kpis?.mttrHours == null ? '—' : `${kpis.mttrHours}h`}
          </div>
          <div className="text-[11px] text-muted">
            For recoveries in the last 7 days
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left Failures List, Right Top Recurring & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Recent Failures List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-text uppercase tracking-wider font-mono">
              Recent Analyzed Failures
            </h2>
            <span className="chip text-[11px] py-0.5 px-2">
              {loading ? 'Loading…' : error ? 'Unavailable' : `${failures.length} of ${failuresTotal} recorded`}
            </span>
          </div>

          <div className="space-y-3">
            {failures.length > 0 ? (
              failures.map((f) => (
                <Link
                  key={f.failureId}
                  href={`/app/failures/${f.failureId}`}
                  className="block glass-panel p-4.5 border border-border/60 glass-panel-hover group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-md border font-mono font-semibold uppercase tracking-wider ${
                            categoryColors[f.category] || 'text-muted bg-surface-2 border-border/40'
                          }`}
                        >
                          {f.category}
                        </span>

                        <span className="text-xs font-mono font-bold text-text truncate group-hover:text-accent transition-colors">
                          {f.ruleId}
                        </span>

                        {f.isRegression && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 border border-danger/30 text-danger font-mono font-bold animate-pulse">
                            ⚠️ REGRESSION
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-text/85 truncate font-sans">
                        {f.summary || f.ruleId}
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-muted font-mono pt-1">
                        <span>Sig: <strong className="text-accent">{f.signature}</strong></span>
                        <span>Seen {f.occurrences}x</span>
                        <span>Workflow: {f.workflow}</span>
                        <span>Job: {f.jobName}</span>
                      </div>
                    </div>

                    <div className="text-right text-muted group-hover:text-accent group-hover:translate-x-1 transition-all pt-1">
                      <ArrowRight className="w-4 h-4 ml-auto" aria-hidden="true" />
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="glass-panel p-8 text-center space-y-3 border border-border/60">
                <ShieldAlert className="w-8 h-8 text-muted mx-auto" aria-hidden="true" />
                <div className="font-display text-base font-bold text-text">
                  {loading ? 'Loading recent failures...' : error ? 'Recent failures unavailable' : 'No analyzed failures in this time window'}
                </div>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  {loading
                    ? 'Recent analyzed failures will appear here when the request completes.'
                    : error
                      ? 'Check the API and MongoDB connection, then refresh this page.'
                      : 'Seed the persisted demo data or connect a project to see analyzed failures here.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Top Recurring (A1) and Trends Chart (A2) (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Top Recurring Failures (Aggregation A1) */}
          <div className="glass-panel p-5 space-y-4 border border-border/60">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <h3 className="font-display text-xs font-bold text-text uppercase font-mono tracking-wider">
                Top Recurring Failures (A1)
              </h3>
              <span className="text-[10px] text-muted font-mono">Last 7 Days</span>
            </div>

            <div className="space-y-3">
              {topRecurring.length > 0 ? topRecurring.map((item: any) => (
                <div
                  key={item.signature}
                  className="p-3.5 rounded-xl bg-surface-2 border border-border/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-text">
                      {item.ruleId}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/25">
                      {item.count} occurrences
                    </span>
                  </div>

                  <div className="text-[11px] text-muted truncate font-mono">
                    {item.sampleEvidence || item.signature}
                  </div>

                  {item.status === 'regressed' && (
                    <div className="text-[10px] text-danger font-mono flex items-center gap-1 font-semibold pt-0.5">
                      <span>⚠️ Regressed after being marked fixed</span>
                    </div>
                  )}
                </div>
              )) : (
                <p className="py-4 text-center text-xs text-muted">
                  {loading ? 'Loading recurring failures...' : error ? 'Recurring failure data unavailable.' : 'No recurring signatures in the last 7 days.'}
                </p>
              )}
            </div>
          </div>

          {/* Daily Failure Trend Chart (Aggregation A2) */}
          <div className="glass-panel p-5 space-y-3 border border-border/60">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <h3 className="font-display text-xs font-bold text-text uppercase font-mono tracking-wider">
                Daily Failure Trend (A2)
              </h3>
              <span className="text-[10px] text-muted font-mono">14 Days</span>
            </div>

            <div className="h-44 w-full pt-2">
              {hasDailyFailures ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#9DB5A8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#9DB5A8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#060D0A',
                      borderColor: 'rgba(110,231,183,0.3)',
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: '#ECF6F0',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                    }}
                  />
                  <Bar dataKey="failures" radius={[4, 4, 0, 0]}>
                    {chartData.map((_entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === chartData.length - 1 ? '#34D399' : 'rgba(52,211,153,0.45)'}
                      />
                    ))}
                  </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted">
                  {loading ? 'Loading daily failures...' : error ? 'Daily failure data unavailable.' : 'No daily failure data in the last 14 days.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
