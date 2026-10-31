import { KnownFixRecord, ScopeRun, FailureOccurrenceRecord, VerificationStatus } from './types.js';

export interface EvaluateKnownFixParams {
  knownFix?: {
    note: string;
    commitSha?: string;
    author?: string;
    fixedAt: string | Date;
    verificationStatus?: VerificationStatus;
    verifiedAt?: string | Date;
    verifiedByRunId?: string;
  };
  scopeRuns: ScopeRun[];
  signatureOccurrences: FailureOccurrenceRecord[];
}

export function evaluateKnownFix(params: EvaluateKnownFixParams): KnownFixRecord | undefined {
  if (!params.knownFix) {
    return undefined;
  }

  const fixedAtDate = new Date(params.knownFix.fixedAt);
  const fixedAtMs = fixedAtDate.getTime();

  let verificationStatus: VerificationStatus = params.knownFix.verificationStatus || 'unverified';
  let verifiedAt = params.knownFix.verifiedAt ? new Date(params.knownFix.verifiedAt).toISOString() : undefined;
  let verifiedByRunId = params.knownFix.verifiedByRunId;

  // Filter runs in scope that started or completed after the fix was recorded
  const laterRuns = params.scopeRuns
    .filter((r) => {
      const rTime = new Date(r.completedAt || r.startedAt).getTime();
      return rTime >= fixedAtMs;
    })
    .sort((a, b) => {
      const tA = new Date(a.completedAt || a.startedAt).getTime();
      const tB = new Date(b.completedAt || b.startedAt).getTime();
      return tA - tB;
    });

  // Find the earliest run after fixedAt
  let firstSuccessAfterFix: ScopeRun | undefined;
  let firstFailureAfterFix: FailureOccurrenceRecord | undefined;

  for (const r of laterRuns) {
    if (r.conclusion === 'success') {
      firstSuccessAfterFix = r;
      break;
    }
    // Check if this run had a failure with this signature
    const failureInRun = params.signatureOccurrences.find((fo) => fo.runId === r.runId);
    if (failureInRun) {
      firstFailureAfterFix = failureInRun;
      break;
    }
  }

  if (firstSuccessAfterFix) {
    verificationStatus = 'verified';
    verifiedAt = new Date(firstSuccessAfterFix.completedAt || firstSuccessAfterFix.startedAt).toISOString();
    verifiedByRunId = firstSuccessAfterFix.runId;
  } else if (firstFailureAfterFix) {
    // A failure with the same signature occurred after fix without any intervening green run
    verificationStatus = 'ineffective';
  }

  return {
    note: params.knownFix.note,
    commitSha: params.knownFix.commitSha,
    author: params.knownFix.author,
    fixedAt: fixedAtDate.toISOString(),
    verificationStatus,
    verifiedAt,
    verifiedByRunId
  };
}
