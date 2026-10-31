'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, Terminal, ExternalLink, ShieldAlert, RefreshCw, Key } from 'lucide-react';

export default function ProjectsSetupPage() {
  const [project, setProject] = useState<any>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [activeSnippetTab, setActiveSnippetTab] = useState<'workflow' | 'curl' | 'webhook'>('workflow');

  useEffect(() => {
    async function loadProject() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      try {
        const res = await fetch(`${apiUrl}/api/projects/demo-shop`);
        if (res.ok) {
          const json = await res.json();
          setProject(json.project);
        }
      } catch (err) {
        console.warn('Projects fetch error:', err);
      }
    }

    loadProject();
  }, []);

  const handleCopy = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${apiUrl}/api/projects/demo-shop/sync`, { method: 'POST' });
      if (res.ok) {
        setSyncMessage('✅ Manual sync triggered. Recent runs queued for analysis.');
      }
    } catch (e) {
      setSyncMessage('Sync request dispatched.');
    } finally {
      setSyncing(false);
    }
  };

  const webhookUrl = project?.webhookUrl || 'http://localhost:4000/api/webhooks/github';
  const webhookSecret = project?.webhookSecret || 'culprit_demo_secret_2026';
  const ingestToken = project?.ingestToken || 'clp_demo_token_xyz';

  const ghaSnippet = `name: Culprit Ingest
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test -- --ci --testResultsProcessor=jest-junit
      
      - name: Send Test Results to Culprit
        if: always()
        run: |
          curl -X POST "${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/ingest/demo-shop" \\
            -H "Authorization: Bearer \${{ secrets.CULPRIT_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d @- << 'EOF'
          {
            "run": {
              "externalId": "\${{ github.run_id }}",
              "branch": "\${{ github.ref_name }}",
              "sha": "\${{ github.sha }}",
              "workflow": "\${{ github.workflow }}",
              "status": "\${{ job.status }}"
            }
          }
          EOF`;

  const curlSnippet = `curl -X POST "${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/ingest/demo-shop" \\
  -H "Authorization: Bearer ${ingestToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "run": {
      "externalId": "run-412",
      "branch": "main",
      "sha": "9f8e7d6",
      "workflow": "CI Pipeline",
      "status": "failure"
    },
    "log": "npm ERR! npm ci can only install packages when your package.json and package-lock.json are in sync."
  }'`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-center justify-between pb-4 border-b border-border/40">
        <div>
          <h1 className="text-xl font-bold text-text">Projects & Ingestion Setup</h1>
          <p className="text-xs text-muted mt-1">Connect your GitHub repositories or send CI telemetry from any provider.</p>
        </div>

        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent font-mono transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Project Credentials Card */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-text font-mono">Culprit Demo Shop</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-accent-soft text-accent font-mono">
              culprit-ci/culprit-demo-shop
            </span>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/40 text-xs font-mono text-text transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync Recent Runs</span>
          </button>
        </div>

        {syncMessage && (
          <div className="text-xs font-mono text-accent bg-accent/15 p-2.5 rounded-lg border border-accent/30">
            {syncMessage}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Webhook URL */}
          <div className="p-3.5 rounded-xl bg-surface-2 border border-border/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted font-mono">Webhook URL</span>
              <button
                onClick={() => handleCopy(webhookUrl, setCopiedWebhook)}
                className="text-muted hover:text-accent cursor-pointer"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-xs font-mono text-text truncate">{webhookUrl}</div>
          </div>

          {/* Webhook Secret */}
          <div className="p-3.5 rounded-xl bg-surface-2 border border-border/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted font-mono">Webhook Secret (HMAC-SHA256)</span>
              <button
                onClick={() => handleCopy(webhookSecret, setCopiedSecret)}
                className="text-muted hover:text-accent cursor-pointer"
              >
                {copiedSecret ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-xs font-mono text-accent truncate">{webhookSecret}</div>
          </div>
        </div>
      </div>

      {/* Tabbed Setup Snippets */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex border-b border-border/40 gap-4 text-xs font-mono">
          <button
            onClick={() => setActiveSnippetTab('workflow')}
            className={`pb-2 transition-colors cursor-pointer ${
              activeSnippetTab === 'workflow' ? 'border-b-2 border-accent text-accent font-bold' : 'text-muted'
            }`}
          >
            GitHub Actions (.yml)
          </button>
          <button
            onClick={() => setActiveSnippetTab('curl')}
            className={`pb-2 transition-colors cursor-pointer ${
              activeSnippetTab === 'curl' ? 'border-b-2 border-accent text-accent font-bold' : 'text-muted'
            }`}
          >
            Generic Ingest (cURL)
          </button>
          <button
            onClick={() => setActiveSnippetTab('webhook')}
            className={`pb-2 transition-colors cursor-pointer ${
              activeSnippetTab === 'webhook' ? 'border-b-2 border-accent text-accent font-bold' : 'text-muted'
            }`}
          >
            Webhook Setup (5 Steps)
          </button>
        </div>

        {activeSnippetTab === 'workflow' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-mono">.github/workflows/culprit-ci.yml</span>
              <button
                onClick={() => handleCopy(ghaSnippet, setCopiedSnippet)}
                className="flex items-center gap-1 text-xs text-accent hover:text-[#34f38b] font-mono cursor-pointer"
              >
                {copiedSnippet ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>Copy Workflow</span>
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-black/90 border border-border/40 font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre">
              {ghaSnippet}
            </pre>
          </div>
        )}

        {activeSnippetTab === 'curl' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-mono">Any CI Ingest (GitLab, Jenkins, CircleCI)</span>
              <button
                onClick={() => handleCopy(curlSnippet, setCopiedCurl)}
                className="flex items-center gap-1 text-xs text-accent hover:text-[#34f38b] font-mono cursor-pointer"
              >
                {copiedCurl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>Copy cURL</span>
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-black/90 border border-border/40 font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre">
              {curlSnippet}
            </pre>
          </div>
        )}

        {activeSnippetTab === 'webhook' && (
          <div className="space-y-3 text-xs text-text p-2">
            <ol className="list-decimal list-inside space-y-2 leading-relaxed">
              <li>In your GitHub repo, navigate to <strong>Settings → Webhooks → Add webhook</strong>.</li>
              <li>Paste the <strong>Payload URL</strong>: <code className="text-accent">{webhookUrl}</code></li>
              <li>Set <strong>Content type</strong> to <code className="text-accent">application/json</code>.</li>
              <li>Enter the <strong>Secret</strong>: <code className="text-accent">{webhookSecret}</code>.</li>
              <li>Select <strong>&quot;Let me select individual events&quot;</strong> and check <strong>Workflow runs</strong>. Click Add webhook.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
