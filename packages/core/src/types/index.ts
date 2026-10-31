import { z } from 'zod';

export const FailureCategorySchema = z.enum([
  'dependency',
  'build_compile',
  'test_failure',
  'lint_format',
  'config_env',
  'permissions_secrets',
  'docker_container',
  'network_transient',
  'infra_runner',
  'timeout',
  'unknown'
]);
export type FailureCategory = z.infer<typeof FailureCategorySchema>;

export const EvidenceLineSchema = z.object({
  lineNo: z.number(),
  text: z.string(),
  role: z.enum(['primary', 'context'])
});
export type EvidenceLine = z.infer<typeof EvidenceLineSchema>;

export const RuleMatchSchema = z.object({
  ruleId: z.string(),
  category: FailureCategorySchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceLineSchema),
  extracted: z.record(z.union([z.string(), z.number()])),
  transient: z.boolean(),
  title: z.string(),
  explanation: z.string(),
  fixHints: z.array(z.string()),
  suggestedPatch: z.string().optional()
});
export type RuleMatch = z.infer<typeof RuleMatchSchema>;

export interface RedactionResult {
  cleanedText: string;
  redactionCount: number;
  redactedTypes: Record<string, number>;
  lines: string[];
}

export interface FingerprintResult {
  signature: string;
  normalizedPrimaryLine: string;
  canonicalMessage: string;
}

export interface SuspectCommit {
  sha: string;
  author: string;
  message: string;
  files: string[];
  score: number;
  reasons: string[];
}

export type FlakeVerdict = 'flaky' | 'broken' | 'watch' | 'stable';

export interface FlakeStats {
  testId: string;
  totalRuns: number;
  fails: number;
  passes: number;
  flakeRate: number;
  sameShaFlips: number;
  flips: number;
  verdict: FlakeVerdict;
  recommendation: string;
  sampleErrorMessage?: string;
  historySparkline: ('pass' | 'fail')[];
}

export interface ParsedLog {
  raw: string;
  cleanedLines: { lineNo: number; text: string }[];
  steps: {
    name: string;
    hasError: boolean;
    lines: { lineNo: number; text: string }[];
  }[];
  failingStepName?: string;
  redactions: {
    count: number;
    types: Record<string, number>;
  };
  windowedLines: { lineNo: number; text: string }[];
}

export const DiagnosisSchema = z.object({
  diagnosisId: z.string().optional(),
  failureId: z.string().optional(),
  signature: z.string(),
  category: FailureCategorySchema,
  ruleId: z.string(),
  title: z.string(),
  summary: z.string(),
  rootCause: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  evidenceLines: z.array(z.number()),
  fixSteps: z.array(z.string()),
  patch: z.string().optional(),
  verifyWith: z.string().optional(),
  preventWith: z.string().optional(),
  suspects: z.array(
    z.object({
      sha: z.string(),
      author: z.string(),
      message: z.string(),
      files: z.array(z.string()),
      score: z.number(),
      reasons: z.array(z.string())
    })
  ).optional(),
  isLikelyFlaky: z.boolean().optional(),
  source: z.enum(['rules', 'hybrid']),
  model: z.string().optional(),
  tokens: z.number().optional(),
  latencyMs: z.number().optional(),
  feedback: z.object({
    vote: z.enum(['up', 'down']),
    note: z.string().optional()
  }).optional(),
  createdAt: z.string().optional()
});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

export interface TestOutcomeRecord {
  runId: string;
  headSha: string;
  outcome: 'pass' | 'fail' | 'skipped';
  timestamp: Date;
  errorMessage?: string;
}
