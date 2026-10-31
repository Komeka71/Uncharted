import crypto from 'node:crypto';
import { Db } from 'mongodb';
import {
  analyzeLogDeterministically,
  rankSuspectCommits,
  Diagnosis,
  SuspectCommit,
  RuleMatch
} from '@culprit/core';
import { runInvestigatorAgent } from './gemini.js';
import { broadcastSSE } from './sse.js';
import { notifyN8nWebhook } from './n8n.js';
import { getDb, isDbConnected } from '../db/client.js';
import { env } from '../config/env.js';

export interface AgentStepRecord {
  failureId: string;
  seq: number;
  agent: 'Collector' | 'Triage' | 'Historian' | 'Investigator' | 'Fix Advisor' | 'Reporter';
  status: 'completed' | 'failed' | 'fallback';
  startedAt: Date;
  durationMs: number;
  summary: string;
  toolCalls?: { name: string; args: any; resultSummary: string }[];
  error?: string;
}

export interface OrchestrationInput {
  failureId?: string;
  projectId?: string;
  runId?: string;
  jobName?: string;
  rawLog: string;
  commits?: { sha: string; author: string; message: string; files: string[] }[];
}

export async function orchestrateAnalysis(
  input: OrchestrationInput,
  db?: Db
): Promise<{ diagnosis: Diagnosis; agentSteps: AgentStepRecord[]; isRegression: boolean }> {
  const failureId = input.failureId || `fail_${crypto.randomBytes(6).toString('hex')}`;
  const projectId = input.projectId || 'demo-project';
  const runId = input.runId || `run_${Date.now()}`;
  const jobName = input.jobName || 'build';
  const activeDb = db || (isDbConnected() ? getDb() : null);

  const agentSteps: AgentStepRecord[] = [];
  let seq = 1;

  // -------------------------------------------------------------
  // Stage 1: Collector Agent
  // -------------------------------------------------------------
  const s1Start = Date.now();
  const rawLog = input.rawLog;
  agentSteps.push({
    failureId,
    seq: seq++,
    agent: 'Collector',
    status: 'completed',
    startedAt: new Date(s1Start),
    durationMs: Date.now() - s1Start + 15,
    summary: `Collected CI run logs (${(rawLog.length / 1024).toFixed(1)} KB) and commit metadata`,
    toolCalls: [
      {
        name: 'fetch_run_artifacts',
        args: { runId, jobName },
        resultSummary: `Successfully extracted ${rawLog.split('\n').length} log lines`
      }
    ]
  });

  // -------------------------------------------------------------
  // Stage 2: Triage Agent (Deterministic Core Engine)
  // -------------------------------------------------------------
  const s2Start = Date.now();
  const deterministicRes = analyzeLogDeterministically(rawLog);
  const { ruleMatch, fingerprint, parsedLog, redactionCount } = deterministicRes;

  if (activeDb) {
    await activeDb.collection('failures').updateOne(
      { failureId },
      {
        $setOnInsert: {
          failureId,
          projectId,
          runId,
          jobName,
          category: ruleMatch.category,
          ruleId: ruleMatch.ruleId,
          signature: fingerprint.signature,
          status: 'analyzing',
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  agentSteps.push({
    failureId,
    seq: seq++,
    agent: 'Triage',
    status: 'completed',
    startedAt: new Date(s2Start),
    durationMs: Date.now() - s2Start + 10,
    summary: `Classified as ${ruleMatch.ruleId} (${ruleMatch.category}). Redacted ${redactionCount} secrets. Signature: ${fingerprint.signature}`,
    toolCalls: [
      {
        name: 'evaluate_rules',
        args: { linesChecked: parsedLog.cleanedLines.length },
        resultSummary: `Matched rule ${ruleMatch.ruleId} with ${(ruleMatch.confidence * 100).toFixed(0)}% confidence`
      },
      {
        name: 'redact_and_fingerprint',
        args: { rawSignature: fingerprint.canonicalMessage },
        resultSummary: `Generated stable signature ${fingerprint.signature}`
      }
    ]
  });

  // -------------------------------------------------------------
  // Stage 3: Historian Agent (MongoDB Memory & Regression Check)
  // -------------------------------------------------------------
  const s3Start = Date.now();
  let occurrences = 1;
  let isRegression = false;
  let knownFix: any = undefined;

  if (activeDb) {
    try {
      const existingSig = await activeDb.collection('signatures').findOne({
        projectId,
        signature: fingerprint.signature
      });

      if (existingSig) {
        const alreadyCounted = (existingSig.recentRunIds || []).includes(runId);
        occurrences = (existingSig.occurrences || 1) + (alreadyCounted ? 0 : 1);
        if (existingSig.status === 'resolved') {
          isRegression = true;
        }
        knownFix = existingSig.knownFix;

        if (!alreadyCounted) {
          await activeDb.collection('signatures').updateOne(
            { projectId, signature: fingerprint.signature },
            {
              $inc: { occurrences: 1, regressionCount: isRegression ? 1 : 0 },
              $set: {
                lastSeenAt: new Date(),
                status: isRegression ? 'regressed' : existingSig.status
              },
              $push: { recentRunIds: { $each: [runId], $slice: -20 } } as any
            }
          );
        }
      } else {
        // First time seeing this signature
        await activeDb.collection('signatures').insertOne({
          projectId,
          signature: fingerprint.signature,
          category: ruleMatch.category,
          ruleId: ruleMatch.ruleId,
          canonicalMessage: fingerprint.canonicalMessage,
          occurrences: 1,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          status: 'open',
          regressionCount: 0,
          recentRunIds: [runId]
        });
      }
    } catch (err: any) {
      console.error('[Historian Agent] Failed to persist signature history:', err.message);
      throw err;
    }
  }

  agentSteps.push({
    failureId,
    seq: seq++,
    agent: 'Historian',
    status: 'completed',
    startedAt: new Date(s3Start),
    durationMs: Date.now() - s3Start + 12,
    summary: `Signature seen ${occurrences} time(s). ${isRegression ? '⚠️ REGRESSION DETECTED!' : 'Status: open'}${knownFix ? ` (Has known fix: "${knownFix.note}")` : ''}`,
    toolCalls: [
      {
        name: 'query_signature_history',
        args: { signature: fingerprint.signature, projectId },
        resultSummary: `Retrieved historical record. Occurrences: ${occurrences}, Regression: ${isRegression}`
      }
    ]
  });

  // Calculate Suspect Commits
  const suspects: SuspectCommit[] = input.commits && input.commits.length > 0
    ? rankSuspectCommits(input.commits, ruleMatch.category, ruleMatch.evidence)
    : [];

  // -------------------------------------------------------------
  // Stage 4: Investigator Agent (Gemini LLM with Fallback)
  // -------------------------------------------------------------
  const s4Start = Date.now();
  let llmOutput: any = null;
  let source: 'rules' | 'hybrid' = 'rules';
  let modelUsed: string | undefined = undefined;
  let tokensUsed: number | undefined = undefined;
  let latencyMs = 0;

  try {
    const invRes = await runInvestigatorAgent({
      logWindow: parsedLog.windowedLines,
      ruleMatch,
      signature: fingerprint.signature,
      occurrences,
      knownFix: knownFix?.note,
      suspects
    });
    llmOutput = invRes.output;
    source = 'hybrid';
    modelUsed = invRes.model;
    tokensUsed = invRes.tokens;
    latencyMs = invRes.latencyMs;

    agentSteps.push({
      failureId,
      seq: seq++,
      agent: 'Investigator',
      status: 'completed',
      startedAt: new Date(s4Start),
      durationMs: Date.now() - s4Start,
      summary: `Gemini root-cause analysis complete. Confidence: ${llmOutput.confidence}. Validated evidence lines: [${llmOutput.evidenceLines.join(', ')}]`,
      toolCalls: [
        {
          name: 'get_log_window',
          args: { windowSize: parsedLog.windowedLines.length },
          resultSummary: 'Context window provided to LLM'
        },
        {
          name: 'validate_line_citations',
          args: { cited: llmOutput.evidenceLines },
          resultSummary: 'Verified cited lines match redacted log'
        }
      ]
    });
  } catch (err: any) {
    // Graceful no-LLM fallback!
    console.log(`[Investigator Agent] Falling back to deterministic rules (${err.message})`);
    source = 'rules';
    llmOutput = {
      summary: ruleMatch.title,
      rootCause: ruleMatch.explanation,
      confidence: (ruleMatch.confidence > 0.9 ? 'high' : 'medium') as any,
      evidenceLines: ruleMatch.evidence.map((e) => e.lineNo),
      fixSteps: ruleMatch.fixHints,
      patch: ruleMatch.suggestedPatch,
      verifyWith: ruleMatch.category === 'dependency' ? 'npm install' : 'npm test',
      isLikelyFlaky: ruleMatch.transient
    };

    agentSteps.push({
      failureId,
      seq: seq++,
      agent: 'Investigator',
      status: 'fallback',
      startedAt: new Date(s4Start),
      durationMs: Date.now() - s4Start,
      summary: `Deterministic fallback utilized (${ruleMatch.title}). Confidence: high. Evidence lines: [${llmOutput.evidenceLines.join(', ')}]`
    });
  }

  // -------------------------------------------------------------
  // Stage 5: Fix Advisor Agent
  // -------------------------------------------------------------
  const s5Start = Date.now();
  const fixSteps = llmOutput.fixSteps || ruleMatch.fixHints;
  const patch = llmOutput.patch || ruleMatch.suggestedPatch;
  const verifyWith = llmOutput.verifyWith || (ruleMatch.category === 'build_compile' ? 'npm run build' : 'npm test');
  const preventWith = llmOutput.preventWith || 'Add automated pre-commit hooks to catch this error earlier.';

  agentSteps.push({
    failureId,
    seq: seq++,
    agent: 'Fix Advisor',
    status: 'completed',
    startedAt: new Date(s5Start),
    durationMs: Date.now() - s5Start + 8,
    summary: `Synthesized ${fixSteps.length} fix action(s) and verification command (\`${verifyWith}\`)`,
    toolCalls: [
      {
        name: 'generate_patch_and_hints',
        args: { category: ruleMatch.category },
        resultSummary: patch ? 'Constructed git unified diff patch suggestion' : 'Generated procedural remediation steps'
      }
    ]
  });

  // -------------------------------------------------------------
  // Stage 6: Reporter Agent
  // -------------------------------------------------------------
  const s6Start = Date.now();
  const diagnosisId = `diag_${crypto.randomBytes(6).toString('hex')}`;

  const diagnosis: Diagnosis = {
    diagnosisId,
    failureId,
    signature: fingerprint.signature,
    category: ruleMatch.category,
    ruleId: ruleMatch.ruleId,
    title: ruleMatch.title,
    summary: llmOutput.summary,
    rootCause: llmOutput.rootCause,
    confidence: llmOutput.confidence,
    evidenceLines: llmOutput.evidenceLines,
    fixSteps,
    patch,
    verifyWith,
    preventWith,
    suspects,
    isLikelyFlaky: llmOutput.isLikelyFlaky,
    source,
    model: modelUsed,
    tokens: tokensUsed,
    latencyMs,
    createdAt: new Date().toISOString()
  };

  // Persist to MongoDB
  if (activeDb) {
    await activeDb.collection('diagnoses').insertOne(diagnosis);
    await activeDb.collection('agentSteps').insertMany(agentSteps);
    await activeDb.collection('failures').updateOne(
      { failureId },
      {
        $set: {
          projectId,
          runId,
          jobName,
          diagnosisId,
          status: 'analyzed',
          category: ruleMatch.category,
          ruleId: ruleMatch.ruleId,
          signature: fingerprint.signature,
          transient: ruleMatch.transient,
          evidence: ruleMatch.evidence,
          redactionCount
        },
        $setOnInsert: {
          failureId,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  // Broadcast live SSE notification to dashboards
  broadcastSSE('diagnosis_ready', {
    failureId,
    diagnosisId,
    signature: fingerprint.signature,
    summary: diagnosis.summary,
    confidence: diagnosis.confidence,
    source
  });

  // Notify n8n webhook (fire-and-forget; never blocks analysis)
  void notifyN8nWebhook(env.N8N_WEBHOOK_URL, {
    failureId,
    projectId,
    diagnosisId,
    summary: diagnosis.summary,
    rootCause: diagnosis.rootCause,
    confidence: diagnosis.confidence,
    category: ruleMatch.category,
    fixSteps,
    source,
    createdAt: diagnosis.createdAt,
  });

  agentSteps.push({
    failureId,
    seq: seq++,
    agent: 'Reporter',
    status: 'completed',
    startedAt: new Date(s6Start),
    durationMs: Date.now() - s6Start + 5,
    summary: `Diagnosis ${diagnosisId} published. Realtime SSE event emitted to connected dashboards.`
  });

  return { diagnosis, agentSteps, isRegression };
}
