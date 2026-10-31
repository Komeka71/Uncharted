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
    'User-Agent': 'Origin-CI-Investigator'
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
    'User-Agent': 'Origin-CI-Investigator'
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
    'User-Agent': 'Origin-CI-Investigator'
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

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
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
    'User-Agent': 'Origin-CI-Investigator'
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`, { headers });
    if (!res.ok) {
      return [];
    }
    const data = await res.json() as any;
    if (!Array.isArray(data.commits) || data.commits.length === 0) {
      return [];
    }

    // Single commit case: use top-level files from compare payload if available
    if (data.commits.length === 1) {
      const c = data.commits[0];
      const files: string[] = Array.isArray(c.files)
        ? c.files.map((f: any) => f.filename)
        : Array.isArray(data.files)
          ? data.files.map((f: any) => f.filename)
          : [];

      return [{
        sha: c.sha.substring(0, 7),
        author: c.commit?.author?.name || c.author?.login || 'developer',
        message: c.commit?.message?.split('\n')[0] || 'Commit',
        files
      }];
    }

    // Multiple commits: fetch files for up to the first 20 commits with concurrency 5
    const commitsToFetch = data.commits.slice(0, 20);
    const resolvedFirst20 = await mapConcurrent(commitsToFetch, 5, async (c: any): Promise<GitHubCommitCompare> => {
      let files: string[] = [];
      if (Array.isArray(c.files) && c.files.length > 0) {
        files = c.files.map((f: any) => f.filename);
      } else {
        try {
          const cRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${c.sha}`, { headers });
          if (cRes.ok) {
            const cData = await cRes.json() as any;
            if (Array.isArray(cData.files)) {
              files = cData.files.map((f: any) => f.filename);
            }
          }
        } catch {
          // Tolerate individual commit file fetch failure
          files = [];
        }
      }

      return {
        sha: c.sha.substring(0, 7),
        author: c.commit?.author?.name || c.author?.login || 'developer',
        message: c.commit?.message?.split('\n')[0] || 'Commit',
        files
      };
    });

    const remainingCommits: GitHubCommitCompare[] = data.commits.slice(20).map((c: any) => ({
      sha: c.sha.substring(0, 7),
      author: c.commit?.author?.name || c.author?.login || 'developer',
      message: c.commit?.message?.split('\n')[0] || 'Commit',
      files: []
    }));

    return [...resolvedFirst20, ...remainingCommits];
  } catch (err) {
    return [];
  }
}

export async function fetchGitHubRecentRuns(
  owner: string,
  repo: string,
  limit = 20,
  token?: string
): Promise<GitHubWorkflowRun[]> {
  const authToken = token || env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Origin-CI-Investigator'
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const perPage = Math.min(Math.max(limit, 1), 50);
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?status=completed&per_page=${perPage}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): Failed to fetch recent runs for ${owner}/${repo}`);
  }
  const data = await res.json() as { workflow_runs?: GitHubWorkflowRun[] };
  return data.workflow_runs || [];
}

export interface GitHubClient {
  fetchRun: typeof fetchGitHubRun;
  fetchRunJobs: typeof fetchGitHubRunJobs;
  fetchJobLog: typeof fetchGitHubJobLog;
  fetchCompare: typeof fetchGitHubCompare;
  fetchRecentRuns: typeof fetchGitHubRecentRuns;
}

export const defaultGitHubClient: GitHubClient = {
  fetchRun: fetchGitHubRun,
  fetchRunJobs: fetchGitHubRunJobs,
  fetchJobLog: fetchGitHubJobLog,
  fetchCompare: fetchGitHubCompare,
  fetchRecentRuns: fetchGitHubRecentRuns
};

