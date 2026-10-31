import {
  SignatureStatus,
  ScopeRun,
  FailureOccurrenceRecord,
  PreviousOccurrence
} from './types.js';

export interface SignatureStateEvaluation {
  historicalOccurrences: number;
  isFirstOccurrence: boolean;
  status: SignatureStatus;
  isRegression: boolean;
  regressionCount: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  previousOccurrences: PreviousOccurrence[];
  episodeStartedAt?: string;
  resolvedAt?: string;
}

export interface EvaluateSignatureStateParams {
  currentRunId: string;
  currentRunStartedAt: string | Date;
  currentScope?: {
    workflow: string;
    branch: string;
  };
  existingOccurrences: FailureOccurrenceRecord[];
  scopeRuns: ScopeRun[];
  previousRegressionCount?: number;
}

export function evaluateSignatureState(params: EvaluateSignatureStateParams): SignatureStateEvaluation {
  const currentRunStartMs = new Date(params.currentRunStartedAt).getTime();

  // Deduplicate existing occurrences by runId
  const occurrenceMap = new Map<string, FailureOccurrenceRecord>();
  for (const occ of params.existingOccurrences) {
    if (!occurrenceMap.has(occ.runId)) {
      occurrenceMap.set(occ.runId, occ);
    }
  }

  // Check if current run is already an occurrence
  const alreadySeenInCurrentRun = occurrenceMap.has(params.currentRunId);

  // If not already in the set, include current run as an occurrence
  if (!alreadySeenInCurrentRun) {
    occurrenceMap.set(params.currentRunId, {
      runId: params.currentRunId,
      projectId: params.existingOccurrences[0]?.projectId || '',
      signature: params.existingOccurrences[0]?.signature || '',
      workflow: params.currentScope?.workflow,
      branch: params.currentScope?.branch,
      createdAt: params.currentRunStartedAt
    });
  }

  // Sort distinct occurrences chronologically
  const distinctOccurrences = Array.from(occurrenceMap.values()).sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const totalOccurrences = distinctOccurrences.length;
  const isFirstOccurrence = totalOccurrences <= 1 && !alreadySeenInCurrentRun && params.existingOccurrences.length === 0;

  const firstSeenAt = distinctOccurrences[0] ? new Date(distinctOccurrences[0].createdAt).toISOString() : undefined;
  const lastSeenAt = distinctOccurrences[distinctOccurrences.length - 1]
    ? new Date(distinctOccurrences[distinctOccurrences.length - 1].createdAt).toISOString()
    : undefined;

  // Build previous occurrences list (excluding current run, newest first, max 5)
  const previousOccurrences: PreviousOccurrence[] = distinctOccurrences
    .filter((occ) => occ.runId !== params.currentRunId)
    .reverse()
    .slice(0, 5)
    .map((occ) => ({
      failureId: occ.failureId,
      runId: occ.runId,
      branch: occ.branch,
      headSha: occ.headSha,
      at: new Date(occ.createdAt).toISOString()
    }));

  // Determine resolution and regression state
  // An occurrence is 'resolved' in a scope if a run in that scope with conclusion: 'success' completed after it
  // Sort scope runs chronologically
  const sortedScopeRuns = [...params.scopeRuns].sort((a, b) => {
    const tA = new Date(a.completedAt || a.startedAt).getTime();
    const tB = new Date(b.completedAt || b.startedAt).getTime();
    return tA - tB;
  });

  let status: SignatureStatus = 'open';
  let isRegression = false;
  let regressionCount = params.previousRegressionCount || 0;
  let episodeStartedAt: string | undefined = firstSeenAt;
  let resolvedAt: string | undefined = undefined;

  // Track state transitions through time across runs in this scope
  // For each failure occurrence in scope, check if a subsequent green run resolved it
  let wasResolvedBeforeCurrent = false;

  if (params.currentScope && distinctOccurrences.length > 1) {
    // Find latest failure prior to current run
    const priorOccurrences = distinctOccurrences.filter((occ) => {
      return occ.runId !== params.currentRunId && new Date(occ.createdAt).getTime() < currentRunStartMs;
    });

    if (priorOccurrences.length > 0) {
      const latestPriorOcc = priorOccurrences[priorOccurrences.length - 1];
      const latestPriorTime = new Date(latestPriorOcc.createdAt).getTime();

      // Check if there was a successful run after latestPriorTime and before currentRunStartMs
      const resolvingGreenRun = sortedScopeRuns.find((r) => {
        const rTime = new Date(r.completedAt || r.startedAt).getTime();
        return r.conclusion === 'success' && rTime > latestPriorTime && rTime <= currentRunStartMs;
      });

      if (resolvingGreenRun) {
        wasResolvedBeforeCurrent = true;
      }
    }
  }

  // If this signature was resolved prior to the current run starting, and now it failed again:
  if (wasResolvedBeforeCurrent) {
    isRegression = true;
    status = 'regressed';
    if (!alreadySeenInCurrentRun) {
      regressionCount += 1;
    }
    // New episode started at current run
    episodeStartedAt = new Date(params.currentRunStartedAt).toISOString();
  } else {
    // Check if the current run itself is succeeded by a green run in the scope (e.g. during historical sync or reconciliation)
    const latestOccTime = lastSeenAt ? new Date(lastSeenAt).getTime() : currentRunStartMs;
    const laterSuccess = sortedScopeRuns.find((r) => {
      const rTime = new Date(r.completedAt || r.startedAt).getTime();
      return r.conclusion === 'success' && rTime > latestOccTime;
    });

    if (laterSuccess) {
      status = 'resolved';
      resolvedAt = new Date(laterSuccess.completedAt || laterSuccess.startedAt).toISOString();
    } else {
      status = regressionCount > 0 ? 'regressed' : 'open';
    }
  }

  return {
    historicalOccurrences: totalOccurrences,
    isFirstOccurrence,
    status,
    isRegression,
    regressionCount,
    firstSeenAt,
    lastSeenAt,
    previousOccurrences,
    episodeStartedAt,
    resolvedAt
  };
}

export interface Episode {
  episodeStartedAt: Date;
  resolvedAt: Date;
  durationHours: number;
}

export function calculateEpisodesAndMttr(
  failures: FailureOccurrenceRecord[],
  scopeRuns: ScopeRun[]
): { episodes: Episode[]; averageMttrHours: number; sampleSize: number } {
  if (failures.length === 0 || scopeRuns.length === 0) {
    return { episodes: [], averageMttrHours: 0, sampleSize: 0 };
  }

  const sortedFailures = [...failures].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const sortedRuns = [...scopeRuns].sort((a, b) => {
    const tA = new Date(a.completedAt || a.startedAt).getTime();
    const tB = new Date(b.completedAt || b.startedAt).getTime();
    return tA - tB;
  });

  const episodes: Episode[] = [];
  let currentEpisodeStart: Date | null = null;

  // Interleave failures and success runs chronologically
  const timeline: { type: 'fail' | 'success'; time: number; runId: string }[] = [];
  for (const f of sortedFailures) {
    timeline.push({ type: 'fail', time: new Date(f.createdAt).getTime(), runId: f.runId });
  }
  for (const r of sortedRuns) {
    if (r.conclusion === 'success') {
      timeline.push({
        type: 'success',
        time: new Date(r.completedAt || r.startedAt).getTime(),
        runId: r.runId
      });
    }
  }

  timeline.sort((a, b) => a.time - b.time);

  for (const item of timeline) {
    if (item.type === 'fail') {
      if (!currentEpisodeStart) {
        currentEpisodeStart = new Date(item.time);
      }
    } else if (item.type === 'success' && currentEpisodeStart) {
      const resolvedAt = new Date(item.time);
      const diffMs = resolvedAt.getTime() - currentEpisodeStart.getTime();
      if (diffMs > 0) {
        const durationHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
        episodes.push({
          episodeStartedAt: currentEpisodeStart,
          resolvedAt,
          durationHours
        });
      }
      currentEpisodeStart = null;
    }
  }

  const sampleSize = episodes.length;
  if (sampleSize === 0) {
    return { episodes: [], averageMttrHours: 0, sampleSize: 0 };
  }

  const totalHours = episodes.reduce((acc, ep) => acc + ep.durationHours, 0);
  const averageMttrHours = Math.round((totalHours / sampleSize) * 10) / 10;

  return {
    episodes,
    averageMttrHours,
    sampleSize
  };
}
