import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function verifyGitHubWebhookSignature(
  payloadBuffer: Buffer | string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedSignature = parts[1];
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof payloadBuffer === 'string' ? Buffer.from(payloadBuffer) : payloadBuffer);
  const calculatedSignature = hmac.digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const calculatedBuffer = Buffer.from(calculatedSignature, 'hex');

  if (expectedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  event: string;
  status: string;
  conclusion: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  actor?: { login: string };
  pull_requests?: { number: number }[];
  run_attempt: number;
}

export interface GitHubJob {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string;
  started_at: string;
  completed_at: string;
  steps?: {
    name: string;
    status: string;
    conclusion: string;
    number: number;
  }[];
}

export interface GitHubCommitCompare {
  sha: string;
  author: string;
  message: string;
  files: string[];
}

export async function fetchGitHubRun(
  owner: string,
  repo: string,
  runId: number,
  token?: string
): Promise<GitHubWorkflowRun> {
  const authToken = token || env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Culprit-CI-Investigator'
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): Failed to fetch run ${runId}`);
  }
  return await res.json() as GitHubWorkflowRun;
}

export async function fetchGitHubRunJobs(
  owner: string,
  repo: string,
  runId: number,
  token?: string
): Promise<GitHubJob[]> {
  const authToken = token || env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Culprit-CI-Investigator'
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): Failed to fetch jobs for run ${runId}`);
  }
  const data = await res.json() as { jobs: GitHubJob[] };
  return data.jobs || [];
}

export async function fetchGitHubJobLog(
  owner: string,
  repo: string,
  jobId: number,
  token?: string
): Promise<string> {
  const authToken = token || env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Culprit-CI-Investigator'
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
    headers,
    redirect: 'follow'
  });
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): Failed to download logs for job ${jobId}`);
  }
  return await res.text();
}

export async function fetchGitHubCompare(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  token?: string
): Promise<GitHubCommitCompare[]> {
  const authToken = token || env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Culprit-CI-Investigator'
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`, { headers });
    if (!res.ok) {
      return [];
    }
    const data = await res.json() as any;
    if (!Array.isArray(data.commits)) {
      return [];
    }

    return data.commits.map((c: any) => ({
      sha: c.sha.substring(0, 7),
      author: c.commit?.author?.name || c.author?.login || 'developer',
      message: c.commit?.message?.split('\n')[0] || 'Commit',
      files: Array.isArray(c.files) ? c.files.map((f: any) => f.filename) : []
    }));
  } catch (err) {
    return [];
  }
}
