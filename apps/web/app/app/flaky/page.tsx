'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface FlakyTest {
  testId: string;
  verdict: 'flaky' | 'broken' | 'watch' | 'stable';
  totalRuns: number;
  sameShaFlips: number;
  flips: number;
  historySparkline: ('pass' | 'fail')[];
  executionHistory: {
    runId: string;
    headSha: string;
    outcome: 'pass' | 'fail' | 'skipped';
    timestamp: string;
  }[];
  lastErrorMessage?: string;
  recommendation: string;
}

export default function FlakyTestsPage() {
  const [tests, setTests] = useState<FlakyTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFlaky() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      try {
        const res = await fetch(`${apiUrl}/api/flaky?projectId=demo-shop`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error?.message || `Unable to load test results (${res.status}).`);
        }
        setTests(json.tests || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load test results.';
        setError(message);
        console.error('[Flaky tests] Data request failed:', err);
      } finally {
        setLoading(false);
      }
    }

    loadFlaky();
  }, []);

  const verdictStyles: Record<string, string> = {
    flaky: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    broken: 'bg-red-500/15 text-red-400 border-red-500/30',
    watch: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    stable: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/50">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text">Flaky vs Broken Intelligence</h1>
            <span className="chip text-[11px] font-mono py-0.5 px-2.5">
              30-Execution Window
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            <strong>Broken</strong> means consistently failing since a specific commit; <strong>flaky</strong> means inconsistent results or same-SHA flip regressions.
          </p>
        </div>

        <Link
          href="/app"
          className="btn-ghost min-h-[36px] py-1.5 px-3 text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Dashboard</span>
        </Link>
      </div>

      {error ? (
        <div role="alert" className="glass-panel border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
          Test execution data could not be loaded: {error}
        </div>
      ) : (
        <div className="glass-panel overflow-hidden border border-border/80">
          <div className="overflow-x-auto" role="region" aria-label="Flaky test results" tabIndex={0}>
            <table className="w-full min-w-[980px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-[#10211a] text-text font-mono uppercase text-[11px]">
                  <th scope="col" className="py-3.5 px-4 font-semibold">Test Identifier</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold">Verdict</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold text-center whitespace-nowrap">Same-SHA Flips</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold text-center whitespace-nowrap">Outcome Flips</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold text-center whitespace-nowrap">Recent Execution History</th>
                  <th scope="col" className="py-3.5 px-4 font-semibold">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 px-4 text-center text-muted" role="status">
                      Loading test execution results...
                    </td>
                  </tr>
                ) : tests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 px-4 text-center">
                      <div className="font-semibold text-text">No test execution data yet</div>
                      <p className="mt-1 text-muted">
                        Ingest CI test results or seed the persisted demo data to see classifications.
                      </p>
                    </td>
                  </tr>
                ) : tests.map((test) => (
                  <tr key={test.testId} className="hover:bg-surface-2/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-text whitespace-normal break-words max-w-xs">{test.testId}</div>
                      <div className="text-[10px] text-muted mt-0.5">{test.totalRuns} executions in window</div>
                      {test.lastErrorMessage && (
                        <div className="text-[10px] text-muted whitespace-normal break-words max-w-xs mt-0.5">
                          {test.lastErrorMessage}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wide ${verdictStyles[test.verdict]}`}>
                        {test.verdict}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {test.sameShaFlips > 0 ? (
                        <span className="text-amber-300 font-bold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30 whitespace-nowrap">
                          {test.sameShaFlips} flip(s)
                        </span>
                      ) : <span className="text-muted">0</span>}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-text">{test.flips}</td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1" aria-label="Recent test outcomes, oldest first">
                        {test.executionHistory.map((execution, index) => (
                          <span
                            key={`${execution.runId}-${index}`}
                            title={`${execution.outcome} - ${execution.headSha} - ${new Date(execution.timestamp).toLocaleString()}`}
                            className={`w-2 h-3.5 rounded-sm ${
                              execution.outcome === 'pass'
                                ? 'bg-emerald-400'
                                : execution.outcome === 'fail'
                                  ? 'bg-red-400'
                                  : 'bg-slate-400'
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-text/90 whitespace-normal min-w-[240px]">
                      <div className="leading-relaxed">{test.recommendation}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
