import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  processWorkflowRun,
  syncProjectRuns,
  ProcessWorkflowRunPayload
} from '../../src/services/runProcessor.js';
import { GitHubClient, GitHubWorkflowRun, GitHubJob } from '../../src/services/github.js';

describe('Run Processor Service (A3)', () => {
  test('successful run stored in runs and marked processed', async () => {
    const fakeRuns: any[] = [];
    const fakeEvents: any[] = [];

    const mockDb: any = {
      collection: (name: string) => ({
        findOne: async () => ({ projectId: 'test-proj', githubToken: 'mock-token' }),
        updateOne: async (query: any, update: any) => {
          if (name === 'runs') {
            fakeRuns.push({ ...query, ...update.$set });
          }
          if (name === 'ingestEvents') {
            fakeEvents.push({ ...query, ...update.$set });
          }
        }
      })
    };

    let fetchRunJobsCalled = false;
    const fakeClient: GitHubClient = {
      fetchRun: async () => ({} as any),
      fetchRunJobs: async () => {
        fetchRunJobsCalled = true;
        return [];
      },
      fetchJobLog: async () => '',
      fetchCompare: async () => [],
      fetchRecentRuns: async () => []
    };

    const payload: ProcessWorkflowRunPayload = {
      eventId: 'evt_success_123',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      runId: 1001,
      runAttempt: 1,
      conclusion: 'success',
      headSha: 'abc1234',
      headBranch: 'main',
      workflowName: 'CI Build',
      runUrl: 'https://github.com/test-owner/test-repo/actions/runs/1001'
    };

    await processWorkflowRun(payload, fakeClient, mockDb);

    // Verify run stored
    assert.strictEqual(fakeRuns.length, 1);
    assert.strictEqual(fakeRuns[0].conclusion, 'success');
    assert.strictEqual(fakeRuns[0].runId, '1001');

    // Verify ingest event marked processed
    assert.strictEqual(fakeEvents.length, 1);
    assert.strictEqual(fakeEvents[0].status, 'processed');

    // Verify analysis was NOT called for successful run
    assert.strictEqual(fetchRunJobsCalled, false);
  });

  test('failed run analyzed and stored in failures collection', async () => {
    const fakeRuns: any[] = [];
    const fakeFailures: any[] = [];
    const fakeEvents: any[] = [];
    const fakeDiagnoses: any[] = [];
    const fakeAgentSteps: any[] = [];

    const mockDb: any = {
      collection: (name: string) => ({
        findOne: async () => ({ projectId: 'test-proj', githubToken: 'mock-token' }),
        find: () => ({
          sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
          limit: () => ({ toArray: async () => [] })
        }),
        updateOne: async (query: any, update: any) => {
          if (name === 'runs') fakeRuns.push({ ...query, ...update.$set });
          if (name === 'failures') fakeFailures.push({ ...query, ...update.$set });
          if (name === 'ingestEvents') fakeEvents.push({ ...query, ...update.$set });
        },
        insertOne: async (doc: any) => {
          if (name === 'diagnoses') fakeDiagnoses.push(doc);
        },
        insertMany: async (docs: any[]) => {
          if (name === 'agentSteps') fakeAgentSteps.push(...docs);
        }
      })
    };

    const fakeJobs: GitHubJob[] = [
      {
        id: 501,
        run_id: 1002,
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        steps: [
          { name: 'Run tests', status: 'completed', conclusion: 'failure', number: 3 }
        ]
      }
    ];

    const fakeClient: GitHubClient = {
      fetchRun: async () => ({} as any),
      fetchRunJobs: async () => fakeJobs,
      fetchJobLog: async () => `
npm error code EUSAGE
npm error \`npm ci\` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
`,
      fetchCompare: async () => [],
      fetchRecentRuns: async () => []
    };

    const payload: ProcessWorkflowRunPayload = {
      eventId: 'evt_fail_123',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      runId: 1002,
      runAttempt: 1,
      conclusion: 'failure',
      headSha: 'def5678',
      headBranch: 'feature-branch',
      workflowName: 'Test Suite',
      runUrl: 'https://github.com/test-owner/test-repo/actions/runs/1002'
    };

    await processWorkflowRun(payload, fakeClient, mockDb);

    // Verify run stored
    assert.strictEqual(fakeRuns.length, 1);
    assert.strictEqual(fakeRuns[0].conclusion, 'failure');

    // Verify failure stored
    assert.strictEqual(fakeFailures.length >= 1, true);
    assert.strictEqual(fakeFailures[0].runId, '1002');
    assert.strictEqual(fakeFailures[0].jobName, 'test');
    assert.strictEqual(fakeFailures[0].stepName, 'Run tests');

    // Verify event marked processed
    assert.strictEqual(fakeEvents.some((e) => e.status === 'processed'), true);
  });

  test('missing token marks failed with a clear message and does not infinite retry', async () => {
    const fakeEvents: any[] = [];

    const mockDb: any = {
      collection: (name: string) => ({
        findOne: async () => ({ projectId: 'test-proj', githubToken: '' }), // No token
        updateOne: async (query: any, update: any) => {
          if (name === 'ingestEvents') fakeEvents.push({ ...query, ...update.$set });
        }
      })
    };

    const fakeClient: GitHubClient = {
      fetchRun: async () => ({} as any),
      fetchRunJobs: async () => [],
      fetchJobLog: async () => '',
      fetchCompare: async () => [],
      fetchRecentRuns: async () => []
    };

    const payload: ProcessWorkflowRunPayload = {
      eventId: 'evt_no_token',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      runId: 1003,
      conclusion: 'failure',
      headSha: '1111111',
      headBranch: 'main'
    };

    // Should NOT throw (no infinite retry)
    await processWorkflowRun(payload, fakeClient, mockDb);

    assert.strictEqual(fakeEvents.length, 1);
    assert.strictEqual(fakeEvents[0].status, 'failed');
    assert.ok(fakeEvents[0].error.includes('GITHUB_TOKEN missing or lacks Actions read access'));
  });

  test('rate-limited error (403) marks retrying and rethrows for queue backoff', async () => {
    const fakeEvents: any[] = [];

    const mockDb: any = {
      collection: (name: string) => ({
        findOne: async () => ({ projectId: 'test-proj', githubToken: 'token' }),
        updateOne: async (query: any, update: any) => {
          if (name === 'ingestEvents') fakeEvents.push({ ...query, ...update.$set });
        }
      })
    };

    const fakeClient: GitHubClient = {
      fetchRun: async () => ({} as any),
      fetchRunJobs: async () => {
        throw new Error('GitHub API error (403): API rate limit exceeded');
      },
      fetchJobLog: async () => '',
      fetchCompare: async () => [],
      fetchRecentRuns: async () => []
    };

    const payload: ProcessWorkflowRunPayload = {
      eventId: 'evt_rate_limited',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      runId: 1004,
      conclusion: 'failure',
      headSha: '2222222',
      headBranch: 'main'
    };

    // Should rethrow so queue retries with backoff
    await assert.rejects(async () => {
      await processWorkflowRun(payload, fakeClient, mockDb);
    }, /rate limit exceeded/);

    assert.strictEqual(fakeEvents.some((e) => e.status === 'retrying'), true);
  });

  test('sync project runs is idempotent and enqueues runs', async () => {
    const existingEventIds = new Set<string>();

    const mockDb: any = {
      collection: (name: string) => ({
        findOne: async () => ({
          projectId: 'my-proj',
          name: 'My Project',
          repo: { owner: 'test-owner', name: 'test-repo' },
          githubToken: 'mock-token'
        }),
        insertOne: async (doc: any) => {
          if (name === 'ingestEvents') {
            if (existingEventIds.has(doc.eventId)) {
              const err: any = new Error('Duplicate key');
              err.code = 11000;
              throw err;
            }
            existingEventIds.add(doc.eventId);
          }
        }
      })
    };

    const mockRuns: GitHubWorkflowRun[] = [
      {
        id: 2001,
        name: 'Build',
        head_branch: 'main',
        head_sha: 'sha1',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        html_url: 'http://gh/2001',
        run_attempt: 1
      },
      {
        id: 2002,
        name: 'Build',
        head_branch: 'main',
        head_sha: 'sha2',
        event: 'push',
        status: 'completed',
        conclusion: 'failure',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        html_url: 'http://gh/2002',
        run_attempt: 1
      }
    ];

    const fakeClient: GitHubClient = {
      fetchRun: async () => ({} as any),
      fetchRunJobs: async () => [],
      fetchJobLog: async () => '',
      fetchCompare: async () => [],
      fetchRecentRuns: async () => mockRuns
    };

    // First sync
    const res1 = await syncProjectRuns({ projectId: 'my-proj', limit: 10 }, fakeClient, mockDb);
    assert.strictEqual(res1.enqueued, 2);

    // Second sync: identical runs must be deduplicated
    const res2 = await syncProjectRuns({ projectId: 'my-proj', limit: 10 }, fakeClient, mockDb);
    assert.strictEqual(res2.enqueued, 0);
  });
});
