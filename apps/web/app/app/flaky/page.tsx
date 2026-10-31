'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Cpu, AlertTriangle, ShieldCheck, HelpCircle, ArrowRight } from 'lucide-react';

export default function FlakyTestsPage() {
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFlaky() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      try {
        const res = await fetch(`${apiUrl}/api/flaky?projectId=demo-shop`);
        if (res.ok) {
          const json = await res.json();
          setTests(json.tests || []);
        }
      } catch (err) {
        console.warn('Flaky fetch error:', err);
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
      <div className="flex items-center justify-between pb-4 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text">Flaky vs Broken Intelligence</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full badge-glow font-mono font-medium">
              30-Execution Window
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            <strong>Broken</strong> means consistently failing since a specific commit; <strong>flaky</strong> means inconsistent results or same-SHA flip regressions.
          </p>
        </div>

        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent font-mono transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Flaky Table Card */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-surface-2/60 text-muted font-mono uppercase text-[11px]">
                <th className="py-3.5 px-4 font-semibold">Test Identifier</th>
                <th className="py-3.5 px-4 font-semibold">Verdict</th>
                <th className="py-3.5 px-4 font-semibold text-center">Same-SHA Flips</th>
                <th className="py-3.5 px-4 font-semibold text-center">Outcome Flips</th>
                <th className="py-3.5 px-4 font-semibold text-center">Recent History (Sparkline)</th>
                <th className="py-3.5 px-4 font-semibold">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {tests.map((t, idx) => (
                <tr key={idx} className="hover:bg-surface-2/40 transition-colors">
                  {/* Test ID & error */}
                  <td className="py-3.5 px-4 font-mono">
                    <div className="font-bold text-text truncate max-w-xs">{t.testId}</div>
                    {t.lastErrorMessage && (
                      <div className="text-[10px] text-muted truncate max-w-xs mt-0.5">
                        {t.lastErrorMessage}
                      </div>
                    )}
                  </td>

                  {/* Verdict badge */}
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wide ${
                        verdictStyles[t.verdict] || verdictStyles.stable
                      }`}
                    >
                      {t.verdict}
                    </span>
                  </td>

                  {/* Same-SHA flips */}
                  <td className="py-3.5 px-4 text-center font-mono">
                    {t.sameShaFlips > 0 ? (
                      <span className="text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                        {t.sameShaFlips} flip(s)
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>

                  {/* Total outcome flips */}
                  <td className="py-3.5 px-4 text-center font-mono text-muted">
                    {t.flips || 0}
                  </td>

                  {/* Sparkline */}
                  <td className="py-3.5 px-4 text-center">
                    <div className="inline-flex items-center gap-1">
                      {t.historySparkline?.map((outcome: 'pass' | 'fail', sIdx: number) => (
                        <span
                          key={sIdx}
                          title={outcome === 'pass' ? 'Pass' : 'Fail'}
                          className={`w-2 h-3.5 rounded-sm ${
                            outcome === 'pass' ? 'bg-emerald-400/80' : 'bg-red-400'
                          }`}
                        />
                      ))}
                    </div>
                  </td>

                  {/* Recommendation */}
                  <td className="py-3.5 px-4 text-xs text-text/90">
                    <div className="leading-relaxed">{t.recommendation}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
