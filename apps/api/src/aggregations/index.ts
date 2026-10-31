
import { Db } from 'mongodb';
import {
  calculateFlakeStats,
  TestOutcomeRecord,
  FlakeVerdict
} from '@origin/core';

export interface TopRecurringResult {
  signature: string;
  category: string;
  ruleId: string;
  count: number;
  lastSeenAt: Date;
  status: string;
  knownFix?: {
    note: string;
    commitSha?: string;
    author?: string;
    fixedAt: Date;
  };
  sampleEvidence?: string;
}

export async function aggregateTopRecurringFailures(
  db: Db,
  projectId: string,
  days = 7,
  limit = 10
): Promise<TopRecurringResult[]> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const pipeline = [
    {
      $match: {
        projectId,
        createdAt: { $gte: sinceDate }
      }
    },
    // Sort descending so grouping captures the latest occurrence details.
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$signature',
        count: { $sum: 1 },
        category: { $first: '$category' },
        ruleId: { $first: '$ruleId' },
        lastSeenAt: { $max: '$createdAt' },
        sampleEvidence: { $first: '$evidence' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'signatures',
        let: { sig: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$signature', '$$sig'] },
                  { $eq: ['$projectId', projectId] }
                ]
              }
            }
          }
        ],
        as: 'sigInfo'
      }
    },
    {
      $project: {
        signature: '$_id',
        count: 1,
        category: 1,
        ruleId: 1,
        lastSeenAt: 1,
        status: {
          $ifNull: [{ $arrayElemAt: ['$sigInfo.status', 0] }, 'open']
        },
        knownFix: { $arrayElemAt: ['$sigInfo.knownFix', 0] },
        sampleEvidence: {
          $ifNull: [{ $arrayElemAt: ['$sampleEvidence.text', 0] }, '']
        }
      }
    }
  ];

  return await db
    .collection('failures')
    .aggregate<TopRecurringResult>(pipeline)
    .toArray();
}

export interface CategoryTrendResult {
  date: string;
  categories: Record<string, number>;
  total: number;
}

export async function aggregateCategoryTrends(
  db: Db,
  projectId: string,
  days = 14
): Promise<CategoryTrendResult[]> {
  const today = new Date();

  const sinceDate = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - days + 1
    )
  );

  const pipeline = [
    {
      $match: {
        projectId,
        createdAt: { $gte: sinceDate }
      }
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          category: '$category'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        items: {
          $push: {
            category: '$_id.category',
            count: '$count'
          }
        },
        total: { $sum: '$count' }
      }
    },
    { $sort: { _id: 1 } }
  ];

  const results = await db
    .collection('failures')
    .aggregate(pipeline)
    .toArray();

  const trends = new Map<string, CategoryTrendResult>();

  for (const r of results) {
    const categories: Record<string, number> = {};

    for (const item of r.items) {
      categories[item.category] = item.count;
    }

    trends.set(r._id, {
      date: r._id as string,
      categories,
      total: r.total
    });
  }

  // Fill missing dates with zero values for continuous chart data.
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - offset
      )
    );

    const key = date.toISOString().slice(0, 10);

    if (!trends.has(key)) {
      trends.set(key, {
        date: key,
        categories: {},
        total: 0
      });
    }
  }

  return [...trends.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

export interface MttrResult {
  averageMttrHours: number | null;
  totalResolvedSignatures: number;
}

export async function aggregateMttr(
  db: Db,
  projectId: string,
  days = 7
): Promise<MttrResult> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const pipeline = [
    {
      $match: {
        projectId,
        status: 'resolved',
        resolvedAt: { $gte: sinceDate }
      }
    },
    {
      $lookup: {
        from: 'failures',
        let: {
          project: '$projectId',
          signature: '$signature'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$projectId', '$$project'] },
                  { $eq: ['$signature', '$$signature'] }
                ]
              }
            }
          },
          { $limit: 1 }
        ],
        as: 'failureRecords'
      }
    },
    {
      $match: {
        'failureRecords.0': { $exists: true }
      }
    },
    {
      $project: {
        startTime: {
          $ifNull: [
            '$firstSeenAt',
            { $ifNull: ['$firstSeen', '$createdAt'] }
          ]
        },
        endTime: '$resolvedAt'
      }
    },
    {
      $match: {
        startTime: { $ne: null },
        endTime: { $ne: null }
      }
    },
    {
      $project: {
        durationMs: {
          $subtract: ['$endTime', '$startTime']
        }
      }
    },
    {
      $match: {
        durationMs: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: null,
        avgMs: { $avg: '$durationMs' },
        count: { $sum: 1 }
      }
    }
  ];

  const res = await db
    .collection('signatures')
    .aggregate(pipeline)
    .toArray();

  if (res.length === 0 || res[0].avgMs == null) {
    return {
      averageMttrHours: null,
      totalResolvedSignatures: 0
    };
  }

  const hours =
    Math.round(
      (res[0].avgMs / (1000 * 60 * 60)) * 10
    ) / 10;

  return {
    averageMttrHours: hours,
    totalResolvedSignatures: res[0].count
  };
}

export interface RecurringRateResult {
  totalFailures: number;
  recurringFailures: number;
  recurringRatePct: number;
}

/**
 * Computes the percentage of failures whose error signature occurs more than once.
 */
export async function aggregateRecurringRate(
  db: Db,
  projectId: string,
  days = 7
): Promise<RecurringRateResult> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const pipeline = [
    {
      $match: {
        projectId,
        createdAt: { $gte: sinceDate }
      }
    },
    {
      $group: {
        _id: '$signature',
        count: { $sum: 1 }
      }
    }
  ];

  const signatureCounts = await db
    .collection('failures')
    .aggregate<{ _id: string; count: number }>(pipeline)
    .toArray();

  let totalFailures = 0;
  let recurringFailures = 0;

  for (const item of signatureCounts) {
    totalFailures += item.count;

    if (item.count > 1) {
      recurringFailures += item.count;
    }
  }

  const recurringRatePct =
    totalFailures > 0
      ? Math.min(
        100,
        Math.round((recurringFailures / totalFailures) * 100)
      )
      : 0;

  return {
    totalFailures,
    recurringFailures,
    recurringRatePct
  };
}

export interface FlakyAggregationResult {
  testId: string;
  totalRuns: number;
  fails: number;
  passes: number;
  sameShaFlips: number;
  flips: number;
  historySparkline: ('pass' | 'fail')[];
  executionHistory: {
    runId: string;
    headSha: string;
    outcome: 'pass' | 'fail' | 'skipped';
    timestamp: Date;
  }[];
  verdict: FlakeVerdict;
  lastErrorMessage?: string;
  recommendation: string;
  flakeRate?: number;
}

export async function aggregateFlakyTests(
  db: Db,
  projectId: string,
  limit = 20
): Promise<FlakyAggregationResult[]> {
  const pipeline = [
    { $match: { projectId } },
    { $sort: { ts: 1, _id: 1 } },
    {
      $group: {
        _id: '$testId',
        records: {
          $push: {
            runId: '$runId',
            headSha: '$headSha',
            outcome: '$outcome',
            ts: '$ts',
            errorMessage: '$errorMessage'
          }
        }
      }
    }
  ];

  const results = await db
    .collection('testResults')
    .aggregate(pipeline)
    .toArray();

  // Process test records through the core flakiness calculator.
  const assessedTests: FlakyAggregationResult[] = results.map(
    (item: any) => {
      const rawRecords = item.records || [];

      const outcomeRecords: TestOutcomeRecord[] = rawRecords.map(
        (r: any) => ({
          runId: r.runId || '',
          headSha: r.headSha || '',
          outcome: r.outcome,
          timestamp:
            r.ts instanceof Date ? r.ts : new Date(r.ts),
          errorMessage: r.errorMessage
        })
      );

      const stats = calculateFlakeStats(
        item._id,
        outcomeRecords
      );

      return {
        testId: stats.testId,
        totalRuns: stats.totalRuns,
        fails: stats.fails,
        passes: stats.passes,
        sameShaFlips: stats.sameShaFlips,
        flips: stats.flips,
        historySparkline: stats.historySparkline,
        verdict: stats.verdict,
        lastErrorMessage: stats.sampleErrorMessage,
        recommendation: stats.recommendation,
        flakeRate: stats.flakeRate,

        // Keep the latest 30 executions for the UI.
        executionHistory: rawRecords.slice(-30).map(
          (record: any) => ({
            runId: record.runId || '',
            headSha: record.headSha || '',
            outcome: record.outcome,
            timestamp:
              record.ts instanceof Date
                ? record.ts
                : new Date(record.ts)
          })
        )
      };
    }
  );

  // Severity ranking: flaky > broken > watch > stable.
  const severityScore: Record<FlakeVerdict, number> = {
    flaky: 4,
    broken: 3,
    watch: 2,
    stable: 1
  };

  assessedTests.sort((a, b) => {
    const scoreDiff =
      severityScore[b.verdict] - severityScore[a.verdict];

    if (scoreDiff !== 0) return scoreDiff;

    const rateDiff =
      (b.flakeRate || 0) - (a.flakeRate || 0);

    if (rateDiff !== 0) return rateDiff;

    const flipsDiff = b.sameShaFlips - a.sameShaFlips;

    if (flipsDiff !== 0) return flipsDiff;

    return b.totalRuns - a.totalRuns;
  });

  return assessedTests.slice(0, limit);
}
