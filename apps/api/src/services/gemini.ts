import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { RuleMatch, EvidenceLine, SuspectCommit } from '@culprit/core';

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

export async function runInvestigatorAgent(params: {
  logWindow: { lineNo: number; text: string }[];
  ruleMatch: RuleMatch;
  signature: string;
  occurrences: number;
  knownFix?: string;
  suspects?: SuspectCommit[];
}): Promise<{ output: InvestigatorLLMOutput; tokens: number; latencyMs: number; model: string }> {
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

  const prompt = `You are Culprit's Lead CI Failure Investigator. Analyze this redacted CI failure log and produce a grounded diagnosis.

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

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    throw new Error(`LLM output was not valid JSON: ${responseText}`);
  }

  // Validate cited evidence lines exist
  const rawEvidenceLines: number[] = Array.isArray(parsed.evidenceLines) ? parsed.evidenceLines : [];
  const validatedLines = rawEvidenceLines.filter((l) => validLineNumbers.has(l));

  // If LLM hallucinated all lines, fallback to primary evidence from rule engine
  if (validatedLines.length === 0 && params.ruleMatch.evidence.length > 0) {
    for (const ev of params.ruleMatch.evidence) {
      if (validLineNumbers.has(ev.lineNo)) {
        validatedLines.push(ev.lineNo);
      }
    }
  }

  const output: InvestigatorLLMOutput = {
    summary: parsed.summary || params.ruleMatch.title,
    rootCause: parsed.rootCause || params.ruleMatch.explanation,
    confidence: (['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium') as any,
    evidenceLines: validatedLines.length > 0 ? validatedLines : [params.ruleMatch.evidence[0]?.lineNo || 1],
    fixSteps: Array.isArray(parsed.fixSteps) && parsed.fixSteps.length > 0 ? parsed.fixSteps : params.ruleMatch.fixHints,
    patch: parsed.patch || params.ruleMatch.suggestedPatch,
    verifyWith: parsed.verifyWith,
    preventWith: parsed.preventWith,
    isLikelyFlaky: typeof parsed.isLikelyFlaky === 'boolean' ? parsed.isLikelyFlaky : params.ruleMatch.transient
  };

  return {
    output,
    tokens: 450, // estimated or read from usageMetadata if present
    latencyMs,
    model: modelName
  };
}
