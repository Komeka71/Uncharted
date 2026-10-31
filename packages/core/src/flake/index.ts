import { FlakeStats, FlakeVerdict, TestOutcomeRecord } from '../types/index.js';

export function calculateFlakeStats(
  testId: string,
  records: TestOutcomeRecord[]
): FlakeStats {
  // Sort ascending by timestamp (chronological)
  const sorted = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // Take last 30 executions
  const windowRecords = sorted.slice(-30);
  const totalRuns = windowRecords.length;

  let fails = 0;
  let passes = 0;
  let lastErrorMessage: string | undefined;
  const historySparkline: ('pass' | 'fail')[] = [];

  // Track outcome per SHA to find same-SHA flips
  const shaOutcomes = new Map<string, Set<'pass' | 'fail'>>();
  let flips = 0;
  let previousOutcome: 'pass' | 'fail' | null = null;

  for (const rec of windowRecords) {
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

  // Count same-SHA flips (commits that both passed and failed)
  let sameShaFlips = 0;
  for (const outcomes of shaOutcomes.values()) {
    if (outcomes.has('pass') && outcomes.has('fail')) {
      sameShaFlips++;
    }
  }

  const flakeRate = totalRuns > 0 ? Math.round((fails / totalRuns) * 100) / 100 : 0;

  // Verdict logic
  let verdict: FlakeVerdict = 'stable';
  let recommendation = 'Test suite is stable. No action required.';

  if (fails === 0) {
    verdict = 'stable';
    recommendation = 'Test is healthy and passing consistently.';
  } else if (totalRuns < 5) {
    verdict = 'watch';
    recommendation = 'Recent failure observed, but insufficient historical runs (<5) to determine flakiness.';
  } else if (passes === 0) {
    // 100% fail in window -> Broken
    verdict = 'broken';
    recommendation = 'Consistent failure across all executions. Genuine regression or breaking code defect.';
  } else if (sameShaFlips > 0 || flips >= 3) {
    // Both passes and fails + same commit flipped or high oscillation
    verdict = 'flaky';
    recommendation = `High flakiness detected (${sameShaFlips} same-SHA flip(s), ${flips} outcome flips). Quarantine candidate to prevent blocking CI.`;
  } else if (fails > 0 && passes > 0) {
    // Check if it transitioned from passing to consistently failing
    const last3 = historySparkline.slice(-3);
    const allRecentFailed = last3.length === 3 && last3.every((o) => o === 'fail');
    if (allRecentFailed && flips <= 2 && sameShaFlips === 0) {
      verdict = 'broken';
      recommendation = 'Test recently broke after previous passes. Check suspect commits for regression.';
    } else {
      verdict = 'flaky';
      recommendation = 'Intermittent failures observed. Review asynchronous locks, timeouts, or race conditions.';
    }
  }

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
    historySparkline
  };
}
