import { z } from 'zod';
import { SuspectCommit } from '../types/index.js';

export const VerificationStatusSchema = z.enum(['unverified', 'verified', 'ineffective']);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const SignatureStatusSchema = z.enum(['open', 'resolved', 'regressed']);
export type SignatureStatus = z.infer<typeof SignatureStatusSchema>;

export const KnownFixRecordSchema = z.object({
  note: z.string(),
  commitSha: z.string().optional(),
  author: z.string().optional(),
  fixedAt: z.string(),
  verificationStatus: VerificationStatusSchema,
  verifiedAt: z.string().optional(),
  verifiedByRunId: z.string().optional()
});
export type KnownFixRecord = z.infer<typeof KnownFixRecordSchema>;

export const PreviousOccurrenceSchema = z.object({
  failureId: z.string().optional(),
  runId: z.string(),
  branch: z.string().optional(),
  headSha: z.string().optional(),
  at: z.string()
});
export type PreviousOccurrence = z.infer<typeof PreviousOccurrenceSchema>;

export const SuspectCommitStatusSchema = z.enum(['ranked', 'no_match', 'insufficient_data', 'not_requested']);
export type SuspectCommitStatus = z.infer<typeof SuspectCommitStatusSchema>;

export const FlakyStatusSchema = z.enum(['FLAKY', 'BROKEN', 'WATCH', 'STABLE', 'INSUFFICIENT_DATA', 'NOT_APPLICABLE']);
export type FlakyStatus = z.infer<typeof FlakyStatusSchema>;

export const FlakyTestSummarySchema = z.object({
  testId: z.string(),
  verdict: z.string(),
  evidence: z.enum(['sufficient', 'insufficient']),
  executions: z.number(),
  flakeRate: z.number(),
  sameShaFlips: z.number()
});
export type FlakyTestSummary = z.infer<typeof FlakyTestSummarySchema>;

export const HistoricalContextSchema = z.object({
  runId: z.string(),
  projectId: z.string(),
  signature: z.string(),
  historicalOccurrences: z.number(),
  isFirstOccurrence: z.boolean(),
  firstSeenAt: z.string().optional(),
  lastSeenAt: z.string().optional(),
  status: SignatureStatusSchema,
  isRegression: z.boolean(),
  regressionCount: z.number(),
  previousOccurrences: z.array(PreviousOccurrenceSchema),
  knownFix: KnownFixRecordSchema.optional(),
  suspectCommits: z.object({
    status: SuspectCommitStatusSchema,
    commits: z.array(z.any()),
    baseSha: z.string().optional(),
    headSha: z.string().optional(),
    notes: z.array(z.string())
  }),
  flaky: z.object({
    status: FlakyStatusSchema,
    tests: z.array(FlakyTestSummarySchema)
  }),
  dataQuality: z.object({
    dbAvailable: z.boolean(),
    notes: z.array(z.string())
  })
});
export type HistoricalContext = z.infer<typeof HistoricalContextSchema>;

export interface ScopeRun {
  runId: string;
  workflow: string;
  branch: string;
  headSha: string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'timed_out' | 'neutral' | 'skipped' | string;
  startedAt: string | Date;
  completedAt?: string | Date;
}

export interface FailureOccurrenceRecord {
  failureId?: string;
  runId: string;
  projectId: string;
  signature: string;
  workflow?: string;
  branch?: string;
  headSha?: string;
  createdAt: string | Date;
}
