import { FlakeStats, FlakeVerdict, TestOutcomeRecord } from '../types/index.js';

export interface FlakeAssessment {
  evidence: 'sufficient' | 'insufficient';
  reasons: string[];
  executions: number;
}

export interface FlakeStatsWithAssessment extends FlakeStats {
  assessment: FlakeAssessment;
}

export function calculateFlakeStats(
  testId: string,
  records: TestOutcomeRecord[]
): FlakeStatsWithAssessment {
  // Sort ascending by timestamp (chronological)
  const sorted = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Take last 30 executions
  const windowRecords = sorted.slice(-30);

  let fails = 0;
  let passes = 0;
  let lastErrorMessage: string | undefined;
  const historySparkline: ('pass' | 'fail')[] = [];

  // Track outcome per SHA to find same-SHA flips
  const shaOutcomes = new Map<string, Set<'pass' | 'fail'>>();
  let flips = 0;
  let previousOutcome: 'pass' | 'fail' | null = null;

  for (const rec of windowRecords) {
    // Exclude skipped records from totalRuns and outcome evaluation
    if (rec.outcome === 'skipped') continue;

    const outcome: 'pass' | 'fail' = rec.outcome === 'pass' ? 'pass' : 'fail';
    historySparkline.push(outcome);

    if (outcome === 'fail') {
      fails++;
      if (rec.errorMessage) {
        lastErrorMessage = rec.errorMessage;
      }
    } else {
      passes++;
    }

    // Outcome flip check
    if (previousOutcome !== null && previousOutcome !== outcome) {
      flips++;
    }
    previousOutcome = outcome;

    // Same-SHA check
    if (!shaOutcomes.has(rec.headSha)) {
      shaOutcomes.set(rec.headSha, new Set());
    }
    shaOutcomes.get(rec.headSha)!.add(outcome);
  }

  // totalRuns must count ONLY non-skipped executions
  const totalRuns = passes + fails;

  // Count same-SHA flips (commits that both passed and failed)
  let sameShaFlips = 0;
  for (const outcomes of shaOutcomes.values()) {
    if (outcomes.has('pass') && outcomes.has('fail')) {
      sameShaFlips++;
    }
  }

  const flakeRate = totalRuns > 0 ? Math.round((fails / totalRuns) * 100) / 100 : 0;

  // Assessment & Verdict logic
  const reasons: string[] = [];
  let verdict: FlakeVerdict = 'stable';
  let recommendation = 'Test suite is stable. No action required.';
  const evidenceSufficient = totalRuns >= 5;

  if (!evidenceSufficient) {
    reasons.push(`Insufficient historical sample (${totalRuns} executions; minimum 5 required).`);
    if (fails > 0) {
      verdict = 'watch';
      recommendation = `Recent failure observed, but insufficient historical runs (${totalRuns}/5) to determine flakiness.`;
    } else {
      verdict = 'stable';
      recommendation = `Test is currently passing, but insufficient runs (${totalRuns}/5) to declare long-term stability.`;
    }
  } else if (fails === 0) {
    verdict = 'stable';
    recommendation = 'Test is healthy and passing consistently.';
    reasons.push('0 failures across recent execution window.');
  } else if (passes === 0) {
    // 100% fail in window -> Broken
    verdict = 'broken';
    recommendation = 'Consistent failure across all executions. Genuine regression or breaking code defect.';
    reasons.push(`100% failure rate across ${totalRuns} executions.`);
  } else if (sameShaFlips > 0 || flips >= 3) {
    // Both passes and fails + same commit flipped or high oscillation
    verdict = 'flaky';
    recommendation = `High flakiness detected (${sameShaFlips} same-SHA flip(s), ${flips} outcome flips). Quarantine candidate to prevent blocking CI.`;
    if (sameShaFlips > 0) {
      reasons.push(`${sameShaFlips} same-commit flip(s) detected.`);
    }
    if (flips >= 3) {
      reasons.push(`High outcome oscillation (${flips} flips).`);
    }
  } else {
    // Mixed outcomes with no same-commit flip and < 3 flips
    const last3 = historySparkline.slice(-3);
    const allRecentFailed = last3.length === 3 && last3.every((o) => o === 'fail');
    if (allRecentFailed && flips <= 2 && sameShaFlips === 0) {
      verdict = 'broken';
      recommendation = 'Test recently broke after previous passes. Check suspect commits for regression.';
      reasons.push('Recent consecutive failures indicate code regression.');
    } else {
      // Both outcomes present, but NO same-commit flip and < 3 flips -> watch
      verdict = 'watch';
      recommendation = 'Isolated failure observed across different commits without same-commit oscillation (<3 flips). Monitor before quarantining.';
      reasons.push(`Low oscillation (${flips} flips) across different commits; placed on watch.`);
    }
  }

  const assessment: FlakeAssessment = {
    evidence: evidenceSufficient ? 'sufficient' : 'insufficient',
    reasons,
    executions: totalRuns
  };

  return {
    testId,
    totalRuns,
    fails,
    passes,
    flakeRate,
    sameShaFlips,
    flips,
    verdict,
    recommendation,
    sampleErrorMessage: lastErrorMessage,
    historySparkline,
    assessment
  };
}

