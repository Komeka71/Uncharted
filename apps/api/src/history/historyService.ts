// import { Db } from 'mongodb';
// import {
//   HistoricalContext,
//   HistoricalContextSchema,
//   KnownFixRecord,
//   PreviousOccurrence,
//   FlakyTestSummary,
//   ScopeRun,
//   FailureOccurrenceRecord,
//   evaluateSignatureState,
//   evaluateKnownFix,
//   calculateFlakeStats,
//   TestOutcomeRecord,
//   SuspectCommitStatus,
//   FlakyStatus
// } from '@origin/core';

// export interface BuildHistoricalContextInput {
//   projectId: string;
//   signature: string;
//   currentRunId: string;
//   currentSha: string;
//   scope?: string;
//   workflowName?: string;
//   jobName?: string;
//   now?: Date;
// }

// export interface RecordOccurrenceParams {
//   projectId: string;
//   signature: string;
//   runId: string;
//   headSha: string;
//   jobName?: string;
//   stepName?: string;
//   category?: string;
//   ruleId?: string;
//   now?: Date;
// }

// export interface RecordKnownFixParams {
//   projectId: string;
//   signature: string;
//   note: string;
//   commitSha?: string;
//   author?: string;
//   now?: Date;
// }

// export interface ResolvedCommitRange {
//   baseSha?: string;
//   headSha: string;
//   status: 'resolved' | 'first_in_branch' | 'no_prior_success' | 'unknown';
// }

// // In-memory memoization of indexed databases
// const indexedDatabases = new Set<string>();

// /**
//  * Ensures required historical indexes exist. Idempotent and memoized.
//  * Handles existing index conflict error codes (85, 86) without crashing.
//  */
// export async function ensureHistoryIndexes(db: Db): Promise<void> {
//   const dbName = db.databaseName;
//   if (indexedDatabases.has(dbName)) {
//     return;
//   }

//   const safeCreateIndex = async (
//     collectionName: string,
//     spec: Record<string, 1 | -1>,
//     options?: { unique?: boolean; name?: string; sparse?: boolean }
//   ) => {
//     try {
//       await db.collection(collectionName).createIndex(spec, options);
//     } catch (err: any) {
//       // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict
//       if (err.code === 85 || err.code === 86 || err.message?.includes('already exists')) {
//         console.warn(`[ensureHistoryIndexes] Index conflict on ${collectionName} (${options?.name || JSON.stringify(spec)}): ${err.message}`);
//       } else {
//         console.warn(`[ensureHistoryIndexes] Warning creating index on ${collectionName}: ${err.message}`);
//       }
//     }
//   };

//   try {
//     // 1. signatures
//     await safeCreateIndex('signatures', { projectId: 1, signature: 1 }, { unique: true, name: 'hist_signatures_project_signature' });
//     await safeCreateIndex('signatures', { projectId: 1, status: 1, lastSeen: -1 }, { name: 'hist_signatures_project_status_lastseen' });

//     // 2. failures
//     await safeCreateIndex('failures', { projectId: 1, signature: 1, createdAt: -1 }, { name: 'hist_failures_project_sig_created' });
//     await safeCreateIndex('failures', { projectId: 1, createdAt: -1 }, { name: 'hist_failures_project_created' });

//     // 3. runs
//     await safeCreateIndex('runs', { projectId: 1, branch: 1, conclusion: 1, completedAt: -1 }, { name: 'hist_runs_project_branch_conclusion_completed' });
//     await safeCreateIndex('runs', { projectId: 1, headSha: 1 }, { name: 'hist_runs_project_headsha' });

//     // 4. known_fixes
//     await safeCreateIndex('known_fixes', { projectId: 1, signature: 1, fixedAt: -1 }, { name: 'hist_knownfixes_project_sig_fixed' });

//     // 5. testResults
//     await safeCreateIndex('testResults', { projectId: 1, testId: 1, ts: -1 }, { name: 'hist_testresults_project_testid_ts' });

//     indexedDatabases.add(dbName);
//   } catch (err: any) {
//     console.warn(`[ensureHistoryIndexes] Error while ensuring indexes: ${err.message}`);
//   }
// }

// /**
//  * Atomically records or updates a failure occurrence for a signature.
//  * Idempotent: re-analyzing the same run does not inflate occurrences.
//  */
// export async function recordFailureOccurrence(
//   db: Db,
//   params: RecordOccurrenceParams
// ): Promise<{ occurrences: number; isFirstOccurrence: boolean; isRegression: boolean }> {
//   await ensureHistoryIndexes(db);
//   const now = params.now || new Date();
//   const { projectId, signature, runId, headSha } = params;

//   const existing = await db.collection('signatures').findOne({ projectId, signature });

//   if (!existing) {
//     // First occurrence
//     await db.collection('signatures').insertOne({
//       projectId,
//       signature,
//       occurrences: 1,
//       status: 'open',
//       firstSeen: now,
//       firstSeenAt: now,
//       lastSeen: now,
//       lastSeenAt: now,
//       lastRunId: runId,
//       lastHeadSha: headSha,
//       recentRunIds: [runId],
//       category: params.category,
//       ruleId: params.ruleId,
//       createdAt: now,
//       updatedAt: now
//     });

//     return { occurrences: 1, isFirstOccurrence: true, isRegression: false };
//   }

//   const recentRunIds: string[] = existing.recentRunIds || [];
//   const isAlreadyCounted = recentRunIds.includes(runId);

//   if (isAlreadyCounted) {
//     // Idempotent: touch updatedAt without incrementing
//     await db.collection('signatures').updateOne(
//       { _id: existing._id },
//       { $set: { updatedAt: now } }
//     );
//     return {
//       occurrences: existing.occurrences || 1,
//       isFirstOccurrence: (existing.occurrences || 1) <= 1,
//       isRegression: existing.status === 'regressed'
//     };
//   }

//   // Not counted yet: increment occurrence and handle regression
//   const isRegression = existing.status === 'resolved';
//   const newStatus = isRegression ? 'regressed' : (existing.status || 'open');
//   const newOccurrences = (existing.occurrences || 1) + 1;

//   await db.collection('signatures').updateOne(
//     { _id: existing._id },
//     {
//       $inc: { occurrences: 1 },
//       $set: {
//         lastSeen: now,
//         lastSeenAt: now,
//         lastRunId: runId,
//         lastHeadSha: headSha,
//         status: newStatus,
//         updatedAt: now,
//         ...(isRegression ? { reopenedAt: now } : {}),
//         ...(params.category ? { category: params.category } : {}),
//         ...(params.ruleId ? { ruleId: params.ruleId } : {})
//       },
//       $push: {
//         recentRunIds: { $each: [runId], $slice: -50 } as any
//       }
//     }
//   );

//   return {
//     occurrences: newOccurrences,
//     isFirstOccurrence: false,
//     isRegression
//   };
// }

// /**
//  * Records a known fix for a signature as 'unverified'.
//  * Does NOT set signature status to resolved.
//  */
// export async function recordKnownFix(
//   db: Db,
//   params: RecordKnownFixParams
// ): Promise<KnownFixRecord> {
//   await ensureHistoryIndexes(db);
//   const now = params.now || new Date();
//   const { projectId, signature, note, commitSha } = params;
//   const author = params.author || 'Team Member';

//   const fixDoc: KnownFixRecord = {
//     note,
//     commitSha,
//     author,
//     fixedAt: now.toISOString(),
//     verificationStatus: 'unverified'
//   };

//   // 1. Insert into known_fixes collection
//   await db.collection('known_fixes').insertOne({
//     projectId,
//     signature,
//     ...fixDoc,
//     fixedAtDate: now,
//     createdAt: now
//   });

//   // 2. Set knownFix field on the signature document (without marking resolved!)
//   await db.collection('signatures').updateOne(
//     { projectId, signature },
//     {
//       $set: {
//         knownFix: fixDoc,
//         updatedAt: now
//       }
//     },
//     { upsert: false }
//   );

//   return fixDoc;
// }

// /**
//  * Resolves the commit range by finding the last prior successful run in the branch/scope.
//  */
// export async function resolveCommitRange(
//   db: Db,
//   params: { projectId: string; headSha: string; branch?: string; scope?: string }
// ): Promise<ResolvedCommitRange> {
//   const { projectId, headSha } = params;
//   const branch = params.branch || params.scope || 'main';

//   // Find previous successful run on the same branch
//   const priorSuccess = await db.collection('runs')
//     .find({
//       projectId,
//       branch,
//       conclusion: { $in: ['success', 'neutral'] },
//       headSha: { $ne: headSha }
//     })
//     .sort({ completedAt: -1, startedAt: -1 })
//     .limit(1)
//     .toArray();

//   if (priorSuccess.length > 0 && priorSuccess[0].headSha) {
//     return {
//       baseSha: priorSuccess[0].headSha,
//       headSha,
//       status: 'resolved'
//     };
//   }

//   // Check if any run exists on this branch
//   const anyBranchRun = await db.collection('runs')
//     .find({ projectId, branch })
//     .limit(2)
//     .toArray();

//   if (anyBranchRun.length <= 1) {
//     return {
//       headSha,
//       status: 'first_in_branch'
//     };
//   }

//   return {
//     headSha,
//     status: 'no_prior_success'
//   };
// }

// /**
//  * Reconciles open/regressed signatures by checking if a subsequent green run in the scope succeeded.
//  */
// export async function reconcileSignatureStatuses(
//   db: Db,
//   projectId: string,
//   now = new Date()
// ): Promise<{ resolvedCount: number }> {
//   let resolvedCount = 0;

//   // Find signatures that are open or regressed
//   const activeSignatures = await db.collection('signatures')
//     .find({
//       projectId,
//       status: { $in: ['open', 'regressed'] }
//     })
//     .toArray();

//   for (const sig of activeSignatures) {
//     const lastSeen = sig.lastSeen || sig.lastSeenAt || sig.updatedAt || new Date(0);

//     // Look for green run after lastSeen
//     const greenRun = await db.collection('runs').findOne({
//       projectId,
//       conclusion: 'success',
//       completedAt: { $gt: new Date(lastSeen) }
//     }, { sort: { completedAt: 1 } });

//     if (greenRun) {
//       const resolvedAt = greenRun.completedAt || now;

//       // Update signature to resolved
//       await db.collection('signatures').updateOne(
//         { _id: sig._id },
//         {
//           $set: {
//             status: 'resolved',
//             resolvedAt: resolvedAt instanceof Date ? resolvedAt : new Date(resolvedAt),
//             updatedAt: now,
//             ...(sig.knownFix ? { 'knownFix.verificationStatus': 'verified' } : {})
//           }
//         }
//       );

//       // If known_fixes collection has unverified fix, update it too
//       if (sig.knownFix) {
//         await db.collection('known_fixes').updateMany(
//           { projectId, signature: sig.signature, verificationStatus: 'unverified' },
//           { $set: { verificationStatus: 'verified', verifiedAt: resolvedAt } }
//         );
//       }

//       resolvedCount++;
//     }
//   }

//   return { resolvedCount };
// }

// /**
//  * Builds the complete, typed HistoricalContext for an investigation.
//  * Never throws — falls back cleanly if DB is unavailable.
//  */
// export async function buildHistoricalContext(
//   db: Db | null | undefined,
//   input: BuildHistoricalContextInput
// ): Promise<HistoricalContext> {
//   const now = input.now || new Date();
//   const { projectId, signature, currentRunId, currentSha, scope, workflowName } = input;
//   const branchName = scope || 'main';
//   const workflow = workflowName || 'CI';

//   // Graceful offline fallback
//   if (!db) {
//     return HistoricalContextSchema.parse({
//       runId: currentRunId,
//       projectId,
//       signature,
//       historicalOccurrences: 1,
//       isFirstOccurrence: true,
//       firstSeenAt: now.toISOString(),
//       lastSeenAt: now.toISOString(),
//       status: 'open',
//       isRegression: false,
//       regressionCount: 0,
//       previousOccurrences: [],
//       suspectCommits: {
//         status: 'not_requested' as SuspectCommitStatus,
//         commits: [],
//         headSha: currentSha,
//         notes: ['Database offline; suspect commit analysis skipped.']
//       },
//       flaky: {
//         status: 'INSUFFICIENT_DATA' as FlakyStatus,
//         tests: []
//       },
//       dataQuality: {
//         dbAvailable: false,
//         notes: ['Database unavailable; running with fallback single-occurrence context.']
//       }
//     });
//   }

//   try {
//     await ensureHistoryIndexes(db);

//     // 1. Fetch failures for this signature to evaluate state
//     const rawFailures = await db.collection('failures')
//       .find({ projectId, signature })
//       .sort({ createdAt: -1 })
//       .limit(50)
//       .toArray();

//     const existingOccurrences: FailureOccurrenceRecord[] = rawFailures.map((f) => ({
//       failureId: f.failureId,
//       runId: f.runId,
//       projectId: f.projectId,
//       signature: f.signature,
//       workflow: f.workflow || workflow,
//       branch: f.branch || branchName,
//       headSha: f.headSha,
//       createdAt: f.createdAt instanceof Date ? f.createdAt : new Date(f.createdAt || now)
//     }));

//     // 2. Fetch runs in the scope
//     const scopeRunsRaw = await db.collection('runs')
//       .find({ projectId, branch: branchName })
//       .sort({ startedAt: -1 })
//       .limit(50)
//       .toArray();

//     const scopeRuns: ScopeRun[] = scopeRunsRaw.map((r) => ({
//       runId: r.runId,
//       workflow: r.workflow || workflow,
//       branch: r.branch || branchName,
//       headSha: r.headSha,
//       conclusion: r.conclusion || r.status || 'unknown',
//       startedAt: r.startedAt instanceof Date ? r.startedAt : new Date(r.startedAt || now),
//       completedAt: r.completedAt ? (r.completedAt instanceof Date ? r.completedAt : new Date(r.completedAt)) : undefined
//     }));

//     // 3. Evaluate signature state using core state machine
//     const stateEval = evaluateSignatureState({
//       currentRunId,
//       currentRunStartedAt: now,
//       currentScope: { workflow, branch: branchName },
//       existingOccurrences,
//       scopeRuns
//     });

//     // 4. Known fix evaluation
//     let knownFix: KnownFixRecord | undefined = undefined;
//     const sigDoc = await db.collection('signatures').findOne({ projectId, signature });
//     const rawFix = sigDoc?.knownFix || await db.collection('known_fixes').findOne({ projectId, signature }, { sort: { fixedAt: -1 } });

//     if (rawFix) {
//       knownFix = evaluateKnownFix({
//         knownFix: {
//           note: rawFix.note,
//           commitSha: rawFix.commitSha,
//           author: rawFix.author,
//           fixedAt: rawFix.fixedAt || rawFix.fixedAtDate || now,
//           verificationStatus: rawFix.verificationStatus,
//           verifiedAt: rawFix.verifiedAt,
//           verifiedByRunId: rawFix.verifiedByRunId
//         },
//         scopeRuns,
//         signatureOccurrences: existingOccurrences
//       });
//     }

//     // 5. Flaky test evaluation
//     const flakyTests: FlakyTestSummary[] = [];
//     const failedTestsRaw = await db.collection('testResults')
//       .find({ projectId, runId: currentRunId, outcome: 'fail' })
//       .limit(5)
//       .toArray();

//     for (const failedTest of failedTestsRaw) {
//       const testHistory = await db.collection('testResults')
//         .find({ projectId, testId: failedTest.testId })
//         .sort({ ts: 1 })
//         .limit(30)
//         .toArray();

//       if (testHistory.length > 0) {
//         const outcomeRecords: TestOutcomeRecord[] = testHistory.map((th) => ({
//           runId: th.runId,
//           headSha: th.headSha,
//           outcome: th.outcome,
//           timestamp: th.ts instanceof Date ? th.ts : new Date(th.ts),
//           errorMessage: th.errorMessage
//         }));

//         const stats = calculateFlakeStats(failedTest.testId, outcomeRecords);
//         flakyTests.push({
//           testId: stats.testId,
//           verdict: stats.verdict,
//           evidence: stats.assessment.evidence,
//           executions: stats.totalRuns,
//           flakeRate: stats.flakeRate,
//           sameShaFlips: stats.sameShaFlips
//         });
//       }
//     }

//     let flakyStatus: FlakyStatus = 'NOT_APPLICABLE';
//     if (flakyTests.length > 0) {
//       if (flakyTests.some((t) => t.verdict === 'flaky')) {
//         flakyStatus = 'FLAKY';
//       } else if (flakyTests.some((t) => t.verdict === 'broken')) {
//         flakyStatus = 'BROKEN';
//       } else if (flakyTests.some((t) => t.verdict === 'watch')) {
//         flakyStatus = 'WATCH';
//       } else {
//         flakyStatus = 'STABLE';
//       }
//     }

//     // 6. Commit range resolution
//     const commitRange = await resolveCommitRange(db, {
//       projectId,
//       headSha: currentSha,
//       branch: branchName
//     });

//     const suspectStatus: SuspectCommitStatus = commitRange.baseSha ? 'ranked' : 'insufficient_data';
//     const suspectNotes = commitRange.baseSha
//       ? [`Compared against base SHA ${commitRange.baseSha.slice(0, 7)}.`]
//       : ['No prior successful baseline run found for commit comparison.'];

//     return HistoricalContextSchema.parse({
//       runId: currentRunId,
//       projectId,
//       signature,
//       historicalOccurrences: stateEval.historicalOccurrences,
//       isFirstOccurrence: stateEval.isFirstOccurrence,
//       firstSeenAt: stateEval.firstSeenAt,
//       lastSeenAt: stateEval.lastSeenAt,
//       status: stateEval.status,
//       isRegression: stateEval.isRegression,
//       regressionCount: stateEval.regressionCount,
//       previousOccurrences: stateEval.previousOccurrences,
//       knownFix,
//       suspectCommits: {
//         status: suspectStatus,
//         commits: [],
//         baseSha: commitRange.baseSha,
//         headSha: currentSha,
//         notes: suspectNotes
//       },
//       flaky: {
//         status: flakyStatus,
//         tests: flakyTests
//       },
//       dataQuality: {
//         dbAvailable: true,
//         notes: []
//       }
//     });
//   } catch (err: any) {
//     console.warn(`[buildHistoricalContext] Error querying MongoDB: ${err.message}. Returning safe fallback.`);
//     return HistoricalContextSchema.parse({
//       runId: currentRunId,
//       projectId,
//       signature,
//       historicalOccurrences: 1,
//       isFirstOccurrence: true,
//       firstSeenAt: now.toISOString(),
//       lastSeenAt: now.toISOString(),
//       status: 'open',
//       isRegression: false,
//       regressionCount: 0,
//       previousOccurrences: [],
//       suspectCommits: {
//         status: 'insufficient_data' as SuspectCommitStatus,
//         commits: [],
//         headSha: currentSha,
//         notes: [`Error querying commit range: ${err.message}`]
//       },
//       flaky: {
//         status: 'INSUFFICIENT_DATA' as FlakyStatus,
//         tests: []
//       },
//       dataQuality: {
//         dbAvailable: false,
//         notes: [`Failed to query historical context: ${err.message}`]
//       }
//     });
//   }
// }


import { Db } from 'mongodb';
import {
  HistoricalContext,
  HistoricalContextSchema,
  KnownFixRecord,
  PreviousOccurrence,
  FlakyTestSummary,
  ScopeRun,
  FailureOccurrenceRecord,
  evaluateSignatureState,
  evaluateKnownFix,
  calculateFlakeStats,
  TestOutcomeRecord,
  SuspectCommitStatus,
  FlakyStatus
} from '@origin/core';

export interface BuildHistoricalContextInput {
  projectId: string;
  signature: string;
  currentRunId: string;
  currentSha: string;
  scope?: string;
  workflowName?: string;
  jobName?: string;
  now?: Date;
}

export interface RecordOccurrenceParams {
  projectId: string;
  signature: string;
  runId: string;
  headSha: string;
  jobName?: string;
  stepName?: string;
  category?: string;
  ruleId?: string;
  now?: Date;
}

export interface RecordKnownFixParams {
  projectId: string;
  signature: string;
  note: string;
  commitSha?: string;
  author?: string;
  now?: Date;
}

export interface ResolvedCommitRange {
  baseSha?: string;
  headSha: string;
  status: 'resolved' | 'first_in_branch' | 'no_prior_success' | 'unknown';
}

// In-memory memoization of indexed databases
const indexedDatabases = new Set<string>();

/**
 * Ensures required historical indexes exist. Idempotent and memoized.
 * Handles existing index conflict error codes (85, 86) without crashing.
 */
export async function ensureHistoryIndexes(db: Db): Promise<void> {
  const dbName = db.databaseName;

  if (indexedDatabases.has(dbName)) {
    return;
  }

  const safeCreateIndex = async (
    collectionName: string,
    spec: Record<string, 1 | -1>,
    options?: { unique?: boolean; name?: string; sparse?: boolean }
  ) => {
    try {
      await db.collection(collectionName).createIndex(spec, options);
    } catch (err: any) {
      // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict
      if (
        err.code === 85 ||
        err.code === 86 ||
        err.message?.includes('already exists')
      ) {
        console.warn(
          `[ensureHistoryIndexes] Index conflict on ${collectionName} (${options?.name || JSON.stringify(spec)}): ${err.message}`
        );
      } else {
        // Allow the outer handler to catch the error.
        // Do not mark indexes as ready when creation fails.
        throw err;
      }
    }
  };

  try {
    // 1. signatures
    await safeCreateIndex(
      'signatures',
      { projectId: 1, signature: 1 },
      { unique: true, name: 'hist_signatures_project_signature' }
    );

    await safeCreateIndex(
      'signatures',
      { projectId: 1, status: 1, lastSeen: -1 },
      { name: 'hist_signatures_project_status_lastseen' }
    );

    // 2. failures
    await safeCreateIndex(
      'failures',
      { projectId: 1, signature: 1, createdAt: -1 },
      { name: 'hist_failures_project_sig_created' }
    );

    await safeCreateIndex(
      'failures',
      { projectId: 1, createdAt: -1 },
      { name: 'hist_failures_project_created' }
    );

    // 3. runs
    await safeCreateIndex(
      'runs',
      { projectId: 1, branch: 1, conclusion: 1, completedAt: -1 },
      { name: 'hist_runs_project_branch_conclusion_completed' }
    );

    await safeCreateIndex(
      'runs',
      { projectId: 1, headSha: 1 },
      { name: 'hist_runs_project_headsha' }
    );

    // 4. known_fixes
    await safeCreateIndex(
      'known_fixes',
      { projectId: 1, signature: 1, fixedAt: -1 },
      { name: 'hist_knownfixes_project_sig_fixed' }
    );

    // 5. testResults
    await safeCreateIndex(
      'testResults',
      { projectId: 1, testId: 1, ts: -1 },
      { name: 'hist_testresults_project_testid_ts' }
    );

    // Mark indexed only after all index operations succeed
    indexedDatabases.add(dbName);
  } catch (err: any) {
    console.warn(
      `[ensureHistoryIndexes] Error while ensuring indexes: ${err.message}`
    );
  }
}

/**
 * Atomically records or updates a failure occurrence for a signature.
 * Idempotent: re-analyzing the same run does not inflate occurrences.
 */
export async function recordFailureOccurrence(
  db: Db,
  params: RecordOccurrenceParams
): Promise<{ occurrences: number; isFirstOccurrence: boolean; isRegression: boolean }> {
  await ensureHistoryIndexes(db);

  const now = params.now || new Date();
  const { projectId, signature, runId, headSha } = params;

  const existing = await db.collection('signatures').findOne({
    projectId,
    signature
  });

  if (!existing) {
    // First occurrence
    await db.collection('signatures').insertOne({
      projectId,
      signature,
      occurrences: 1,
      status: 'open',
      firstSeen: now,
      firstSeenAt: now,
      lastSeen: now,
      lastSeenAt: now,
      lastRunId: runId,
      lastHeadSha: headSha,
      recentRunIds: [runId],
      category: params.category,
      ruleId: params.ruleId,
      createdAt: now,
      updatedAt: now
    });

    return {
      occurrences: 1,
      isFirstOccurrence: true,
      isRegression: false
    };
  }

  const recentRunIds: string[] = existing.recentRunIds || [];
  const isAlreadyCounted = recentRunIds.includes(runId);

  if (isAlreadyCounted) {
    // Idempotent: touch updatedAt without incrementing
    await db.collection('signatures').updateOne(
      { _id: existing._id },
      { $set: { updatedAt: now } }
    );

    return {
      occurrences: existing.occurrences || 1,
      isFirstOccurrence: (existing.occurrences || 1) <= 1,
      isRegression: existing.status === 'regressed'
    };
  }

  // Not counted yet: increment occurrence and handle regression
  const isRegression = existing.status === 'resolved';
  const newStatus = isRegression
    ? 'regressed'
    : (existing.status || 'open');

  const newOccurrences = (existing.occurrences || 1) + 1;

  await db.collection('signatures').updateOne(
    { _id: existing._id },
    {
      $inc: { occurrences: 1 },
      $set: {
        lastSeen: now,
        lastSeenAt: now,
        lastRunId: runId,
        lastHeadSha: headSha,
        status: newStatus,
        updatedAt: now,
        ...(isRegression ? { reopenedAt: now } : {}),
        ...(params.category ? { category: params.category } : {}),
        ...(params.ruleId ? { ruleId: params.ruleId } : {})
      },
      $push: {
        recentRunIds: { $each: [runId], $slice: -50 } as any
      }
    }
  );

  return {
    occurrences: newOccurrences,
    isFirstOccurrence: false,
    isRegression
  };
}

/**
 * Records a known fix for a signature as 'unverified'.
 * Does NOT set signature status to resolved.
 */
export async function recordKnownFix(
  db: Db,
  params: RecordKnownFixParams
): Promise<KnownFixRecord> {
  await ensureHistoryIndexes(db);

  const now = params.now || new Date();
  const { projectId, signature, note, commitSha } = params;
  const author = params.author || 'Team Member';

  const fixDoc: KnownFixRecord = {
    note,
    commitSha,
    author,
    fixedAt: now.toISOString(),
    verificationStatus: 'unverified'
  };

  // 1. Insert into known_fixes collection
  await db.collection('known_fixes').insertOne({
    projectId,
    signature,
    ...fixDoc,
    fixedAtDate: now,
    createdAt: now
  });

  // 2. Set knownFix field on the signature document (without marking resolved!)
  await db.collection('signatures').updateOne(
    { projectId, signature },
    {
      $set: {
        knownFix: fixDoc,
        updatedAt: now
      }
    },
    { upsert: false }
  );

  return fixDoc;
}

/**
 * Resolves the commit range by finding the last prior successful run in the branch/scope.
 */
export async function resolveCommitRange(
  db: Db,
  params: { projectId: string; headSha: string; branch?: string; scope?: string }
): Promise<ResolvedCommitRange> {
  const { projectId, headSha } = params;
  const branch = params.branch || params.scope || 'main';

  // Find previous successful run on the same branch
  const priorSuccess = await db.collection('runs')
    .find({
      projectId,
      branch,
      conclusion: { $in: ['success', 'neutral'] },
      headSha: { $ne: headSha }
    })
    .sort({ completedAt: -1, startedAt: -1 })
    .limit(1)
    .toArray();

  if (priorSuccess.length > 0 && priorSuccess[0].headSha) {
    return {
      baseSha: priorSuccess[0].headSha,
      headSha,
      status: 'resolved'
    };
  }

  // Check if any run exists on this branch
  const anyBranchRun = await db.collection('runs')
    .find({ projectId, branch })
    .limit(2)
    .toArray();

  if (anyBranchRun.length <= 1) {
    return {
      headSha,
      status: 'first_in_branch'
    };
  }

  return {
    headSha,
    status: 'no_prior_success'
  };
}

/**
 * Reconciles open/regressed signatures by checking if a subsequent green run in the scope succeeded.
 */
export async function reconcileSignatureStatuses(
  db: Db,
  projectId: string,
  now = new Date()
): Promise<{ resolvedCount: number }> {
  let resolvedCount = 0;

  // Find signatures that are open or regressed
  const activeSignatures = await db.collection('signatures')
    .find({
      projectId,
      status: { $in: ['open', 'regressed'] }
    })
    .toArray();

  for (const sig of activeSignatures) {
    const lastSeen = sig.lastSeen || sig.lastSeenAt || sig.updatedAt || new Date(0);

    // Look for green run after lastSeen
    const greenRun = await db.collection('runs').findOne({
      projectId,
      conclusion: 'success',
      completedAt: { $gt: new Date(lastSeen) }
    }, { sort: { completedAt: 1 } });

    if (greenRun) {
      const resolvedAt = greenRun.completedAt || now;

      // Update signature to resolved
      await db.collection('signatures').updateOne(
        { _id: sig._id },
        {
          $set: {
            status: 'resolved',
            resolvedAt: resolvedAt instanceof Date ? resolvedAt : new Date(resolvedAt),
            updatedAt: now,
            ...(sig.knownFix ? { 'knownFix.verificationStatus': 'verified' } : {})
          }
        }
      );

      // If known_fixes collection has unverified fix, update it too
      if (sig.knownFix) {
        await db.collection('known_fixes').updateMany(
          { projectId, signature: sig.signature, verificationStatus: 'unverified' },
          { $set: { verificationStatus: 'verified', verifiedAt: resolvedAt } }
        );
      }

      resolvedCount++;
    }
  }

  return { resolvedCount };
}

/**
 * Builds the complete, typed HistoricalContext for an investigation.
 * Never throws — falls back cleanly if DB is unavailable.
 */
export async function buildHistoricalContext(
  db: Db | null | undefined,
  input: BuildHistoricalContextInput
): Promise<HistoricalContext> {
  const now = input.now || new Date();

  const {
    projectId,
    signature,
    currentRunId,
    currentSha,
    scope,
    workflowName
  } = input;

  const branchName = scope || 'main';
  const workflow = workflowName || 'CI';

  // Graceful offline fallback
  if (!db) {
    return HistoricalContextSchema.parse({
      runId: currentRunId,
      projectId,
      signature,
      historicalOccurrences: 1,
      isFirstOccurrence: true,
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      status: 'open',
      isRegression: false,
      regressionCount: 0,
      previousOccurrences: [],
      suspectCommits: {
        status: 'not_requested' as SuspectCommitStatus,
        commits: [],
        headSha: currentSha,
        notes: ['Database offline; suspect commit analysis skipped.']
      },
      flaky: {
        status: 'INSUFFICIENT_DATA' as FlakyStatus,
        tests: []
      },
      dataQuality: {
        dbAvailable: false,
        notes: ['Database unavailable; running with fallback single-occurrence context.']
      }
    });
  }

  try {
    await ensureHistoryIndexes(db);

    // 1. Fetch failures for this signature to evaluate state
    const rawFailures = await db.collection('failures')
      .find({ projectId, signature })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const existingOccurrences: FailureOccurrenceRecord[] = rawFailures.map((f) => ({
      failureId: f.failureId,
      runId: f.runId,
      projectId: f.projectId,
      signature: f.signature,
      workflow: f.workflow || workflow,
      branch: f.branch || branchName,
      headSha: f.headSha,
      createdAt: f.createdAt instanceof Date
        ? f.createdAt
        : new Date(f.createdAt || now)
    }));

    // 2. Fetch runs in the scope
    const scopeRunsRaw = await db.collection('runs')
      .find({ projectId, branch: branchName })
      .sort({ startedAt: -1 })
      .limit(50)
      .toArray();

    const scopeRuns: ScopeRun[] = scopeRunsRaw.map((r) => ({
      runId: r.runId,
      workflow: r.workflow || workflow,
      branch: r.branch || branchName,
      headSha: r.headSha,
      conclusion: r.conclusion || r.status || 'unknown',
      startedAt: r.startedAt instanceof Date
        ? r.startedAt
        : new Date(r.startedAt || now),
      completedAt: r.completedAt
        ? (r.completedAt instanceof Date
          ? r.completedAt
          : new Date(r.completedAt))
        : undefined
    }));

    // 3. Evaluate signature state using core state machine
    const stateEval = evaluateSignatureState({
      currentRunId,
      currentRunStartedAt: now,
      currentScope: { workflow, branch: branchName },
      existingOccurrences,
      scopeRuns
    });

    // 4. Known fix evaluation
    let knownFix: KnownFixRecord | undefined = undefined;

    const sigDoc = await db.collection('signatures').findOne({
      projectId,
      signature
    });

    const rawFix = sigDoc?.knownFix ||
      await db.collection('known_fixes').findOne(
        { projectId, signature },
        { sort: { fixedAt: -1 } }
      );

    if (rawFix) {
      knownFix = evaluateKnownFix({
        knownFix: {
          note: rawFix.note,
          commitSha: rawFix.commitSha,
          author: rawFix.author,
          fixedAt: rawFix.fixedAt || rawFix.fixedAtDate || now,
          verificationStatus: rawFix.verificationStatus,
          verifiedAt: rawFix.verifiedAt,
          verifiedByRunId: rawFix.verifiedByRunId
        },
        scopeRuns,
        signatureOccurrences: existingOccurrences
      });
    }

    // 5. Flaky test evaluation
    const flakyTests: FlakyTestSummary[] = [];

    const failedTestsRaw = await db.collection('testResults')
      .find({ projectId, runId: currentRunId, outcome: 'fail' })
      .limit(5)
      .toArray();

    for (const failedTest of failedTestsRaw) {
      // Fetch the latest 30 executions, then restore chronological order
      const testHistory = await db.collection('testResults')
        .find({ projectId, testId: failedTest.testId })
        .sort({ ts: -1 })
        .limit(30)
        .toArray();

      testHistory.reverse();

      if (testHistory.length > 0) {
        const outcomeRecords: TestOutcomeRecord[] = testHistory.map((th) => ({
          runId: th.runId,
          headSha: th.headSha,
          outcome: th.outcome,
          timestamp: th.ts instanceof Date
            ? th.ts
            : new Date(th.ts),
          errorMessage: th.errorMessage
        }));

        const stats = calculateFlakeStats(
          failedTest.testId,
          outcomeRecords
        );

        flakyTests.push({
          testId: stats.testId,
          verdict: stats.verdict,
          evidence: stats.assessment.evidence,
          executions: stats.totalRuns,
          flakeRate: stats.flakeRate,
          sameShaFlips: stats.sameShaFlips
        });
      }
    }

    let flakyStatus: FlakyStatus = 'NOT_APPLICABLE';

    if (flakyTests.length > 0) {
      if (flakyTests.some((t) => t.verdict === 'flaky')) {
        flakyStatus = 'FLAKY';
      } else if (flakyTests.some((t) => t.verdict === 'broken')) {
        flakyStatus = 'BROKEN';
      } else if (flakyTests.some((t) => t.verdict === 'watch')) {
        flakyStatus = 'WATCH';
      } else {
        flakyStatus = 'STABLE';
      }
    }

    // 6. Commit range resolution
    const commitRange = await resolveCommitRange(db, {
      projectId,
      headSha: currentSha,
      branch: branchName
    });

    const suspectStatus: SuspectCommitStatus = commitRange.baseSha
      ? 'ranked'
      : 'insufficient_data';

    const suspectNotes = commitRange.baseSha
      ? [`Compared against base SHA ${commitRange.baseSha.slice(0, 7)}.`]
      : ['No prior successful baseline run found for commit comparison.'];

    return HistoricalContextSchema.parse({
      runId: currentRunId,
      projectId,
      signature,
      historicalOccurrences: stateEval.historicalOccurrences,
      isFirstOccurrence: stateEval.isFirstOccurrence,
      firstSeenAt: stateEval.firstSeenAt,
      lastSeenAt: stateEval.lastSeenAt,
      status: stateEval.status,
      isRegression: stateEval.isRegression,
      regressionCount: stateEval.regressionCount,
      previousOccurrences: stateEval.previousOccurrences,
      knownFix,
      suspectCommits: {
        status: suspectStatus,
        commits: [],
        baseSha: commitRange.baseSha,
        headSha: currentSha,
        notes: suspectNotes
      },
      flaky: {
        status: flakyStatus,
        tests: flakyTests
      },
      dataQuality: {
        dbAvailable: true,
        notes: []
      }
    });
  } catch (err: any) {
    console.warn(
      `[buildHistoricalContext] Error querying MongoDB: ${err.message}. Returning safe fallback.`
    );

    return HistoricalContextSchema.parse({
      runId: currentRunId,
      projectId,
      signature,
      historicalOccurrences: 1,
      isFirstOccurrence: true,
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      status: 'open',
      isRegression: false,
      regressionCount: 0,
      previousOccurrences: [],
      suspectCommits: {
        status: 'insufficient_data' as SuspectCommitStatus,
        commits: [],
        headSha: currentSha,
        notes: [`Error querying commit range: ${err.message}`]
      },
      flaky: {
        status: 'INSUFFICIENT_DATA' as FlakyStatus,
        tests: []
      },
      dataQuality: {
        dbAvailable: false,
        notes: [`Failed to query historical context: ${err.message}`]
      }
    });
  }
}
