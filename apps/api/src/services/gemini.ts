import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { RuleMatch, EvidenceLine, SuspectCommit } from '@origin/core';
import { z } from 'zod';

export interface InvestigatorLLMOutput {
  summary: string;
  rootCause: string;
  confidence: 'low' | 'medium' | 'high';
  evidenceLines: number[];
  fixSteps: string[];
  patch?: string;
  verifyWith?: string;
  preventWith?: string;
  isLikelyFlaky?: boolean;
}

const EvidenceLineSchema = z.number().int().refine((l) => Number.isFinite(l) && l >= 1, {
  message: 'evidenceLines must be positive integers',
});

const InvestigatorOutputSchema = z.object({
  summary: z.string().nonempty('summary must be a non-empty string'),
  rootCause: z.string().nonempty('rootCause must be a non-empty string'),
  confidence: z.enum(['low', 'medium', 'high']),
  evidenceLines: z.array(EvidenceLineSchema),
  fixSteps: z.array(z.string().nonempty('fixSteps must be non-empty strings')).optional(),
  patch: z.string().optional(),
  verifyWith: z.string().optional(),
  preventWith: z.string().optional(),
  isLikelyFlaky: z.boolean().optional(),
});

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    const inner = lines.slice(1, -1).join('\n');
    return inner.trim();
  }
  return trimmed;
}


/**
 * Validates parsed LLM output and builds the InvestigatorLLMOutput object.
 * Throws a controlled error when required fields fail validation or when no
 * usable evidence/fix steps are available, so the orchestrator's deterministic
 * fallback can run.
 *
 * @param parsed - The raw parsed JSON from the LLM response.
 * @param validLineNumbers - Set of line numbers that exist in the log window.
 * @param ruleMatch - Rule engine result, used for fix-step fallback.
 * @returns A validated InvestigatorLLMOutput object.
 */
export function validateAndBuildOutput(
  parsed: any,
  validLineNumbers: Set<number>,
  ruleMatch: RuleMatch
): InvestigatorLLMOutput {
  // Null or non-object input is invalid
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('LLM output failed validation: input must be a JSON object');
  }

  // Strip invalid optional fields before Zod validation so an otherwise valid
  // diagnosis is not discarded due to a malformed optional field.
  if (parsed.patch !== undefined && typeof parsed.patch !== 'string') delete parsed.patch;
  if (parsed.verifyWith !== undefined && typeof parsed.verifyWith !== 'string') delete parsed.verifyWith;
  if (parsed.preventWith !== undefined && typeof parsed.preventWith !== 'string') delete parsed.preventWith;
  if (parsed.isLikelyFlaky !== undefined && typeof parsed.isLikelyFlaky !== 'boolean') delete parsed.isLikelyFlaky;

  // Validate required fields using Zod; throw so orchestrator fallback runs
  let zodResult: z.infer<typeof InvestigatorOutputSchema>;
  try {
    zodResult = InvestigatorOutputSchema.parse(parsed);
  } catch (err: any) {
    throw new Error(`LLM output failed validation: ${err.message}`);
  }

  // Validate fixSteps: missing/empty falls back to rule hints; malformed throws
  let fixSteps: string[];
  if (!Array.isArray(parsed.fixSteps) || parsed.fixSteps.length === 0) {
    if (Array.isArray(ruleMatch.fixHints) && ruleMatch.fixHints.length > 0) {
      fixSteps = ruleMatch.fixHints;
    } else {
      throw new Error('No usable fix steps from LLM or rule engine');
    }
  } else {
    fixSteps = parsed.fixSteps;
  }

  // Validate evidence lines: must exist in the supplied log window
  const validEvidenceLines = zodResult.evidenceLines.filter((l) => validLineNumbers.has(l));
  if (validEvidenceLines.length === 0) {
    throw new Error('No valid evidence lines cited by LLM');
  }

  const output: InvestigatorLLMOutput = {
    summary: zodResult.summary,
    rootCause: zodResult.rootCause,
    confidence: zodResult.confidence,
    evidenceLines: validEvidenceLines,
    fixSteps,
    patch: zodResult.patch,
    verifyWith: zodResult.verifyWith,
    preventWith: zodResult.preventWith,
    isLikelyFlaky: zodResult.isLikelyFlaky,
  };

  return output;
}

/**
 * Extracts token count from a Gemini generation response.
 * Uses actual SDK usageMetadata when available; falls back to a documented
 * estimate of 450 when metadata is absent.
 *
 * @param response - The Gemini generateContent response object.
 * @returns The token count (actual or estimated).
 */
export function extractTokens(response: any): number {
  // estimated fallback when SDK usageMetadata is absent
  let tokens = 450;
  if (response.usageMetadata) {
    tokens = response.usageMetadata.totalTokenCount;
  }
  return tokens;
}

export async function runInvestigatorAgent(params: {
  logWindow: { lineNo: number; text: string }[];
  ruleMatch: RuleMatch;
  signature: string;
  occurrences: number;
  knownFix?: string;
  suspects?: SuspectCommit[];
}): Promise<{ output: InvestigatorLLMOutput; tokens: number; latencyMs: number; model: string; source: 'rules' | 'hybrid' }> {
  const startTime = Date.now();
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = env.LLM_MODEL || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  });

  const validLineNumbers = new Set(params.logWindow.map((l) => l.lineNo));

  const prompt = `You are Origin's Lead CI Failure Investigator. Analyze this redacted CI failure log and produce a grounded diagnosis.

RULE ENGINE TRIAGE:
- Rule: ${params.ruleMatch.ruleId} (${params.ruleMatch.category})
- Title: ${params.ruleMatch.title}
- Description: ${params.ruleMatch.explanation}
- Transient Infrastructure: ${params.ruleMatch.transient}
- Historical Occurrences: ${params.occurrences}
${params.knownFix ? `- Previous Known Fix: ${params.knownFix}` : ''}
${params.suspects && params.suspects.length > 0 ? `- Suspect Commits: ${JSON.stringify(params.suspects.map(s => ({ sha: s.sha, files: s.files, reasons: s.reasons })))}` : ''}

REDACTED LOG WINDOW (with original 1-indexed line numbers):
${params.logWindow.map((l) => `${l.lineNo}: ${l.text}`).join('\n')}

STRICT REQUIREMENTS:
1. "evidenceLines" MUST ONLY include line numbers that actually exist in the log snippet above.
2. "rootCause" must be direct and technical, explaining why the build failed based on the cited lines.
3. "fixSteps" must be ordered and actionable commands or edits.
4. "patch" should be an optional git unified diff or code snippet if the fix is concise and obvious.
5. "confidence" must be "high", "medium", or "low".

Return ONLY a JSON object with this exact structure:
{
  "summary": "Short 1-sentence headline of the failure",
  "rootCause": "Detailed root-cause explanation citing specific modules/lines",
  "confidence": "high" | "medium" | "low",
  "evidenceLines": [number],
  "fixSteps": ["Step 1", "Step 2"],
  "patch": "optional diff snippet",
  "verifyWith": "command to verify fix locally, e.g. npm run test",
  "preventWith": "prevention advice or linter rule",
  "isLikelyFlaky": boolean
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const latencyMs = Date.now() - startTime;

  // Strip Markdown code fences (```json ... ```) before parsing
  const cleanText = stripCodeFences(responseText);

  let parsed: any;
  try {
    parsed = JSON.parse(cleanText);
  } catch (err) {
    throw new Error(`LLM output was not valid JSON: ${responseText}`);
  }

  // Validate and build output using shared validation logic
  const output = validateAndBuildOutput(parsed, validLineNumbers, params.ruleMatch);

  // Determine source: hybrid only if model cited at least one valid evidence line
  const source: 'rules' | 'hybrid' = 'hybrid';

  // Token usage: actual SDK metadata when available, otherwise documented estimate
  const tokens = extractTokens(result.response);

  return {
    output,
    tokens,
    latencyMs,
    model: modelName,
    source,
  };
}
