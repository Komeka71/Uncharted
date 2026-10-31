// import crypto from 'node:crypto';
// import { Db } from 'mongodb';
// import { env } from '../config/env.js';
// import { getDb, isDbConnected } from '../db/client.js';
// import { registerJobHandler, enqueueJob } from '../queue/jobQueue.js';
// import { orchestrateAnalysis } from './agentOrchestrator.js';
// import { resolveCommitRange } from '../history/historyService.js';
// import {
//   GitHubClient,
//   defaultGitHubClient,
//   GitHubCommitCompare
// } from './github.js';

// export interface ProcessWorkflowRunPayload {
//   eventId?: string;
//   repoOwner: string;
//   repoName: string;
//   runId: number | string;
//   runAttempt?: number;
//   conclusion?: string;
//   headSha: string;
//   headBranch: string;
//   workflowName?: string;
//   runUrl?: string;
//   startedAt?: string | Date;
//   completedAt?: string | Date;
// }

// export interface SyncProjectRunsPayload {
//   projectId: string;
//   limit?: number;
// }

// export async function processWorkflowRun(
//   payload: ProcessWorkflowRunPayload,
//   client: GitHubClient = defaultGitHubClient,
//   dbOverride?: Db | null
// ): Promise<void> {
//   const activeDb = dbOverride !== undefined ? dbOverride : (isDbConnected() ? getDb() : null);

//   // 1. Find project by repo.owner + repo.name (offline/no DB: in-memory fallback without crashing)
//   let project: any = null;
//   if (activeDb) {
//     try {
//       project = await activeDb.collection('projects').findOne({
//         'repo.owner': payload.repoOwner,
//         'repo.name': payload.repoName
//       });
//     } catch (err: any) {
//       console.warn('[RunProcessor] Error finding project:', err.message);
//     }
//   }

//   const projectId = project?.projectId || 'default';
//   const token = project && project.githubToken !== undefined ? project.githubToken : env.GITHUB_TOKEN;
//   const runId = String(payload.runId);

//   // 2. Upsert run into runs collection with stable runId
//   const runDoc = {
//     projectId,
//     runId,
//     workflow: payload.workflowName || 'Workflow',
//     branch: payload.headBranch || 'main',
//     headSha: payload.headSha,
//     status: 'completed',
//     conclusion: payload.conclusion || 'failure',
//     startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
//     completedAt: payload.completedAt ? new Date(payload.completedAt) : new Date(),
//     durationMs: 45000,
//     url: payload.runUrl || ''
//   };

//   if (activeDb) {
//     try {
//       await activeDb.collection('runs').updateOne(
//         { projectId, runId },
//         { $set: runDoc },
//         { upsert: true }
//       );
//     } catch (err: any) {
//       console.warn('[RunProcessor] Error upserting run:', err.message);
//     }
//   }

//   // 3. If conclusion is success: store run only, mark ingest event processed
//   if (payload.conclusion === 'success') {
//     if (activeDb && payload.eventId) {
//       await activeDb.collection('ingestEvents').updateOne(
//         { eventId: payload.eventId },
//         { $set: { status: 'processed', processedAt: new Date() } }
//       );
//     }
//     return;
//   }

//   // 4. Token validation: 401/missing token -> mark failed without infinite retry
//   if (!token) {
//     const errorMsg = 'GITHUB_TOKEN missing or lacks Actions read access';
//     if (activeDb && payload.eventId) {
//       await activeDb.collection('ingestEvents').updateOne(
//         { eventId: payload.eventId },
//         { $set: { status: 'failed', error: errorMsg, failedAt: new Date() } }
//       );
//     }
//     console.warn(`[RunProcessor] Cannot process run ${runId}: ${errorMsg}`);
//     return;
//   }

//   // 5. Fetch jobs and investigate failed steps
//   try {
//     const jobs = await client.fetchRunJobs(payload.repoOwner, payload.repoName, Number(payload.runId), token);
//     const failedJobs = jobs.filter((j) => j.conclusion === 'failure');
//     const targetJobs = failedJobs.length > 0 ? failedJobs : jobs.slice(0, 1);

//     // Resolve commit range for suspect-commit ranking
//     let commits: GitHubCommitCompare[] = [];
//     if (activeDb && payload.headSha) {
//       try {
//         const range = await resolveCommitRange(activeDb, {
//           projectId,
//           headSha: payload.headSha,
//           branch: payload.headBranch
//         });
//         if (range.status === 'resolved' && range.baseSha) {
//           commits = await client.fetchCompare(
//             payload.repoOwner,
//             payload.repoName,
//             range.baseSha,
//             range.headSha,
//             token
//           );
//         }
//       } catch (commitErr) {
//         console.warn('[RunProcessor] Commit comparison resolution failed:', commitErr);
//         commits = [];
//       }
//     }

//     // Process one failure per failed job
//     for (const job of targetJobs) {
//       let rawLog = '';
//       try {
//         rawLog = await client.fetchJobLog(payload.repoOwner, payload.repoName, job.id, token);
//       } catch (logErr: any) {
//         console.warn(`[RunProcessor] Could not download log for job ${job.id}:`, logErr.message);
//         rawLog = `##[error]Failed to download job log: ${logErr.message}`;
//       }

//       const failingStep = job.steps?.find((s) => s.conclusion === 'failure');
//       const stepName = failingStep?.name || 'Run step';
//       const jobName = job.name || 'build';
//       const failureId = `fail_${crypto.randomBytes(6).toString('hex')}`;

//       // Persist failure document with fields required by dashboard
//       if (activeDb) {
//         await activeDb.collection('failures').updateOne(
//           { failureId },
//           {
//             $set: {
//               failureId,
//               projectId,
//               runId,
//               jobName,
//               stepName,
//               url: payload.runUrl || '',
//               createdAt: new Date()
//             }
//           },
//           { upsert: true }
//         );
//       }

//       // Invoke agentic orchestrator
//       await orchestrateAnalysis(
//         {
//           failureId,
//           projectId,
//           runId,
//           jobName,
//           rawLog,
//           commits
//         },
//         activeDb || undefined
//       );
//     }

//     // Mark event processed
//     if (activeDb && payload.eventId) {
//       await activeDb.collection('ingestEvents').updateOne(
//         { eventId: payload.eventId },
//         { $set: { status: 'processed', processedAt: new Date() } }
//       );
//     }
//   } catch (err: any) {
//     const statusMatch = err.message?.match(/\((\d+)\)/);
//     const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

//     if (statusCode === 401 || statusCode === 404) {
//       const errorMsg = `GitHub API returned ${statusCode}: GITHUB_TOKEN missing or lacks Actions read access`;
//       if (activeDb && payload.eventId) {
//         await activeDb.collection('ingestEvents').updateOne(
//           { eventId: payload.eventId },
//           { $set: { status: 'failed', error: errorMsg, failedAt: new Date() } }
//         );
//       }
//       console.warn(`[RunProcessor] Non-retryable error for run ${runId}: ${errorMsg}`);
//       return;
//     }

//     // Rate-limit or 5xx: mark event retrying and rethrow to allow queue retry with backoff
//     if (activeDb && payload.eventId) {
//       await activeDb.collection('ingestEvents').updateOne(
//         { eventId: payload.eventId },
//         { $set: { status: 'retrying', error: err.message, lastAttemptAt: new Date() } }
//       );
//     }
//     throw err;
//   }
// }

// export async function syncProjectRuns(
//   payload: SyncProjectRunsPayload,
//   client: GitHubClient = defaultGitHubClient,
//   dbOverride?: Db | null
// ): Promise<{ enqueued: number }> {
//   const activeDb = dbOverride !== undefined ? dbOverride : (isDbConnected() ? getDb() : null);

//   let project: any = null;
//   if (activeDb) {
//     project = await activeDb.collection('projects').findOne({
//       $or: [{ projectId: payload.projectId }, { _id: payload.projectId as any }]
//     });
//   } else if (payload.projectId === 'demo-shop') {
//     project = {
//       projectId: 'demo-shop',
//       repo: { owner: 'origin-ci', name: 'origin-demo-shop' }
//     };
//   }

//   if (!project) {
//     throw new Error(`Project ${payload.projectId} not found`);
//   }

//   const repoOwner = project.repo?.owner;
//   const repoName = project.repo?.name;
//   const token = project.githubToken || env.GITHUB_TOKEN;

//   if (!repoOwner || !repoName) {
//     throw new Error(`Project ${payload.projectId} has invalid repository configuration`);
//   }

//   if (!token) {
//     throw new Error('GITHUB_TOKEN missing or lacks Actions read access');
//   }

//   const limit = Math.min(Math.max(payload.limit || 20, 1), 50);
//   const runs = await client.fetchRecentRuns(repoOwner, repoName, limit, token);

//   let enqueued = 0;
//   for (const run of runs) {
//     const runAttempt = run.run_attempt || 1;
//     const repoKey = project.repoId || `${repoOwner}/${repoName}`;
//     const eventId = crypto
//       .createHash('sha256')
//       .update(`github:${repoKey}:${run.id}:${runAttempt}:workflow_run:completed`)
//       .digest('hex');

//     let isDuplicate = false;
//     if (activeDb) {
//       try {
//         await activeDb.collection('ingestEvents').insertOne({
//           eventId,
//           projectId: project.projectId,
//           source: 'github',
//           type: 'workflow_run',
//           status: 'received',
//           receivedAt: new Date()
//         });
//       } catch (err: any) {
//         if (err.code === 11000) {
//           isDuplicate = true;
//         }
//       }
//     }

//     if (!isDuplicate) {
//       await enqueueJob('process_workflow_run', {
//         eventId,
//         repoOwner,
//         repoName,
//         runId: run.id,
//         runAttempt,
//         conclusion: run.conclusion,
//         headSha: run.head_sha,
//         headBranch: run.head_branch,
//         workflowName: run.name,
//         runUrl: run.html_url,
//         startedAt: run.created_at,
//         completedAt: run.updated_at
//       });
//       enqueued++;
//     }
//   }

//   return { enqueued };
// }

// export function registerRunProcessorHandlers(client: GitHubClient = defaultGitHubClient): void {
//   registerJobHandler('process_workflow_run', async (payload: ProcessWorkflowRunPayload) => {
//     await processWorkflowRun(payload, client);
//   });

//   registerJobHandler('sync_project_runs', async (payload: SyncProjectRunsPayload) => {
//     await syncProjectRuns(payload, client);
//   });
// }

import crypto from 'node:crypto';
import { Db } from 'mongodb';
import { env } from '../config/env.js';
import { getDb, isDbConnected } from '../db/client.js';
import { registerJobHandler, enqueueJob } from '../queue/jobQueue.js';
import { orchestrateAnalysis } from './agentOrchestrator.js';
import { resolveCommitRange } from '../history/historyService.js';
import {
  GitHubClient,
  defaultGitHubClient,
  GitHubCommitCompare
} from './github.js';

export interface ProcessWorkflowRunPayload {
  eventId?: string;
  repoOwner: string;
  repoName: string;
  runId: number | string;
  runAttempt?: number;
  conclusion?: string;
  headSha: string;
  headBranch: string;
  workflowName?: string;
  runUrl?: string;
  startedAt?: string | Date;
  completedAt?: string | Date;
}

export interface SyncProjectRunsPayload {
  projectId: string;
  limit?: number;
}

async function updateIngestEventStatus(
  db: Db | null,
  eventId: string | undefined,
  status: string,
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  if (!db || !eventId) return;

  await db.collection('ingestEvents').updateOne(
    { eventId },
    {
      $set: {
        status,
        ...extraFields
      }
    }
  );
}

function getGitHubStatusCode(err: any): number {
  return (
    err?.status ||
    err?.statusCode ||
    err?.response?.status ||
    Number(err?.message?.match(/\((\d+)\)/)?.[1]) ||
    0
  );
}

export async function processWorkflowRun(
  payload: ProcessWorkflowRunPayload,
  client: GitHubClient = defaultGitHubClient,
  dbOverride?: Db | null
): Promise<void> {
  const activeDb =
    dbOverride !== undefined
      ? dbOverride
      : isDbConnected()
        ? getDb()
        : null;

  // 1. Find project
  let project: any = null;

  if (activeDb) {
    project = await activeDb.collection('projects').findOne({
      'repo.owner': payload.repoOwner,
      'repo.name': payload.repoName
    });

    if (!project) {
      throw new Error(
        `Project not found for repository ${payload.repoOwner}/${payload.repoName}`
      );
    }
  }

  const projectId = project?.projectId || 'default';
  const token = project?.githubToken || env.GITHUB_TOKEN;
  const runId = String(payload.runId);
  const runAttempt = payload.runAttempt || 1;

  // 2. Calculate actual run duration
  const startedAt = payload.startedAt
    ? new Date(payload.startedAt)
    : new Date();

  const completedAt = payload.completedAt
    ? new Date(payload.completedAt)
    : new Date();

  const durationMs = Math.max(
    0,
    completedAt.getTime() - startedAt.getTime()
  );

  // 3. Upsert run
  const runDoc = {
    projectId,
    runId,
    workflow: payload.workflowName || 'Workflow',
    branch: payload.headBranch || 'main',
    headSha: payload.headSha,
    status: 'completed',
    conclusion: payload.conclusion || 'failure',
    startedAt,
    completedAt,
    durationMs,
    url: payload.runUrl || ''
  };

  if (activeDb) {
    await activeDb.collection('runs').updateOne(
      { projectId, runId },
      { $set: runDoc },
      { upsert: true }
    );
  }

  // 4. Successful runs only need to be stored
  if (payload.conclusion === 'success') {
    await updateIngestEventStatus(
      activeDb,
      payload.eventId,
      'processed',
      { processedAt: new Date() }
    );

    return;
  }

  // 5. Validate GitHub token
  if (!token) {
    const errorMsg =
      'GITHUB_TOKEN missing or lacks Actions read access';

    await updateIngestEventStatus(
      activeDb,
      payload.eventId,
      'failed',
      {
        error: errorMsg,
        failedAt: new Date()
      }
    );

    console.warn(
      `[RunProcessor] Cannot process run ${runId}: ${errorMsg}`
    );

    return;
  }

  // 6. Fetch jobs and investigate failures
  try {
    const jobs = await client.fetchRunJobs(
      payload.repoOwner,
      payload.repoName,
      Number(payload.runId),
      token
    );

    const failedJobs = jobs.filter(
      (job) => job.conclusion === 'failure'
    );

    // Do not analyze an arbitrary job if no failure was found
    if (failedJobs.length === 0) {
      console.warn(
        `[RunProcessor] No failed jobs found for run ${runId}`
      );

      await updateIngestEventStatus(
        activeDb,
        payload.eventId,
        'processed',
        {
          processedAt: new Date(),
          note: 'No failed jobs found'
        }
      );

      return;
    }

    // Resolve commit range for suspect-commit ranking
    let commits: GitHubCommitCompare[] = [];

    if (activeDb && payload.headSha) {
      try {
        const range = await resolveCommitRange(activeDb, {
          projectId,
          headSha: payload.headSha,
          branch: payload.headBranch
        });

        if (range.status === 'resolved' && range.baseSha) {
          commits = await client.fetchCompare(
            payload.repoOwner,
            payload.repoName,
            range.baseSha,
            range.headSha,
            token
          );
        }
      } catch (commitErr) {
        console.warn(
          '[RunProcessor] Commit comparison resolution failed:',
          commitErr
        );

        commits = [];
      }
    }

    // Process each failed job
    for (const job of failedJobs) {
      let rawLog = '';

      try {
        rawLog = await client.fetchJobLog(
          payload.repoOwner,
          payload.repoName,
          job.id,
          token
        );
      } catch (logErr: any) {
        console.warn(
          `[RunProcessor] Could not download log for job ${job.id}:`,
          logErr.message
        );

        rawLog = `##[error]Failed to download job log: ${logErr.message}`;
      }

      const failingStep = job.steps?.find(
        (step) => step.conclusion === 'failure'
      );

      const stepName = failingStep?.name || 'Run step';
      const jobName = job.name || 'build';

      // Stable failure ID prevents duplicates when the same run is retried
      const failureId = `fail_${crypto
        .createHash('sha256')
        .update(
          `${payload.repoOwner}/${payload.repoName}:${runId}:${runAttempt}:${job.id}`
        )
        .digest('hex')
        .slice(0, 12)}`;

      // Persist failure document
      if (activeDb) {
        await activeDb.collection('failures').updateOne(
          { failureId },
          {
            $setOnInsert: {
              failureId,
              projectId,
              runId,
              jobName,
              stepName,
              url: payload.runUrl || '',
              createdAt: new Date()
            }
          },
          { upsert: true }
        );
      }

      // Invoke analysis orchestrator
      await orchestrateAnalysis(
        {
          failureId,
          projectId,
          runId,
          jobName,
          rawLog,
          commits
        },
        activeDb || undefined
      );
    }

    // Mark event processed only after all failed jobs are analyzed
    await updateIngestEventStatus(
      activeDb,
      payload.eventId,
      'processed',
      { processedAt: new Date() }
    );
  } catch (err: any) {
    const statusCode = getGitHubStatusCode(err);

    // Authentication and inaccessible-resource errors are non-retryable
    if (statusCode === 401 || statusCode === 404) {
      const errorMsg =
        `GitHub API returned ${statusCode}: GITHUB_TOKEN missing or lacks Actions read access`;

      await updateIngestEventStatus(
        activeDb,
        payload.eventId,
        'failed',
        {
          error: errorMsg,
          failedAt: new Date()
        }
      );

      console.warn(
        `[RunProcessor] Non-retryable error for run ${runId}: ${errorMsg}`
      );

      return;
    }

    // Retryable errors: update event status and allow queue retry
    await updateIngestEventStatus(
      activeDb,
      payload.eventId,
      'retrying',
      {
        error: err.message || 'Unknown processing error',
        lastAttemptAt: new Date()
      }
    );

    throw err;
  }
}

export async function syncProjectRuns(
  payload: SyncProjectRunsPayload,
  client: GitHubClient = defaultGitHubClient,
  dbOverride?: Db | null
): Promise<{ enqueued: number }> {
  const activeDb =
    dbOverride !== undefined
      ? dbOverride
      : isDbConnected()
        ? getDb()
        : null;

  let project: any = null;

  if (activeDb) {
    project = await activeDb.collection('projects').findOne({
      $or: [
        { projectId: payload.projectId },
        { _id: payload.projectId as any }
      ]
    });
  } else if (payload.projectId === 'demo-shop') {
    project = {
      projectId: 'demo-shop',
      repo: {
        owner: 'origin-ci',
        name: 'origin-demo-shop'
      }
    };
  }

  if (!project) {
    throw new Error(`Project ${payload.projectId} not found`);
  }

  const repoOwner = project.repo?.owner;
  const repoName = project.repo?.name;
  const token = project.githubToken || env.GITHUB_TOKEN;

  if (!repoOwner || !repoName) {
    throw new Error(
      `Project ${payload.projectId} has invalid repository configuration`
    );
  }

  if (!token) {
    throw new Error(
      'GITHUB_TOKEN missing or lacks Actions read access'
    );
  }

  const limit = Math.min(
    Math.max(payload.limit || 20, 1),
    50
  );

  const runs = await client.fetchRecentRuns(
    repoOwner,
    repoName,
    limit,
    token
  );

  let enqueued = 0;

  for (const run of runs) {
    const runAttempt = run.run_attempt || 1;
    const repoKey = project.repoId || `${repoOwner}/${repoName}`;

    const eventId = crypto
      .createHash('sha256')
      .update(
        `github:${repoKey}:${run.id}:${runAttempt}:workflow_run:completed`
      )
      .digest('hex');

    let isDuplicate = false;
    let shouldRetry = false;

    if (activeDb) {
      try {
        await activeDb.collection('ingestEvents').insertOne({
          eventId,
          projectId: project.projectId,
          source: 'github',
          type: 'workflow_run',
          status: 'received',
          receivedAt: new Date()
        });
      } catch (err: any) {
        if (err.code !== 11000) {
          throw err;
        }

        isDuplicate = true;

        const existingEvent = await activeDb
          .collection('ingestEvents')
          .findOne({ eventId });

        // Already processed, queued, or permanently failed events are skipped
        if (
          !existingEvent ||
          existingEvent.status !== 'retrying'
        ) {
          continue;
        }

        // Retry events previously marked as retrying
        shouldRetry = true;
      }
    }

    if (!isDuplicate || shouldRetry) {
      try {
        await enqueueJob('process_workflow_run', {
          eventId,
          repoOwner,
          repoName,
          runId: run.id,
          runAttempt,
          conclusion: run.conclusion,
          headSha: run.head_sha,
          headBranch: run.head_branch,
          workflowName: run.name,
          runUrl: run.html_url,
          startedAt: run.created_at,
          completedAt: run.updated_at
        });

        enqueued++;
      } catch (err: any) {
        await updateIngestEventStatus(
          activeDb,
          eventId,
          'retrying',
          {
            error: err.message || 'Failed to enqueue workflow run',
            lastAttemptAt: new Date()
          }
        );

        throw err;
      }
    }
  }

  return { enqueued };
}

export function registerRunProcessorHandlers(
  client: GitHubClient = defaultGitHubClient
): void {
  registerJobHandler(
    'process_workflow_run',
    async (payload: ProcessWorkflowRunPayload) => {
      await processWorkflowRun(payload, client);
    }
  );

  registerJobHandler(
    'sync_project_runs',
    async (payload: SyncProjectRunsPayload) => {
      await syncProjectRuns(payload, client);
    }
  );
}