import { Document } from 'mongodb';

export const RUNS_SCHEMA: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['runId', 'projectId', 'workflow', 'branch', 'headSha', 'status', 'conclusion', 'startedAt'],
    properties: {
      runId: { bsonType: 'string' },
      projectId: { bsonType: 'string' },
      workflow: { bsonType: 'string' },
      branch: { bsonType: 'string' },
      headSha: { bsonType: 'string' },
      event: { bsonType: 'string' },
      actor: { bsonType: 'string' },
      status: { bsonType: 'string' },
      conclusion: { bsonType: 'string' },
      startedAt: { bsonType: 'date' },
      completedAt: { bsonType: ['date', 'null'] },
      durationMs: { bsonType: 'number' },
      url: { bsonType: 'string' },
      prNumber: { bsonType: ['number', 'null'] }
    }
  }
};

export const FAILURES_SCHEMA: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['failureId', 'projectId', 'runId', 'jobName', 'category', 'ruleId', 'signature', 'createdAt'],
    properties: {
      failureId: { bsonType: 'string' },
      projectId: { bsonType: 'string' },
      runId: { bsonType: 'string' },
      jobName: { bsonType: 'string' },
      stepName: { bsonType: 'string' },
      exitCode: { bsonType: ['number', 'null'] },
      category: { bsonType: 'string' },
      ruleId: { bsonType: 'string' },
      signature: { bsonType: 'string' },
      transient: { bsonType: 'bool' },
      redactionCount: { bsonType: 'number' },
      status: { bsonType: 'string' },
      diagnosisId: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' }
    }
  }
};

export const TEST_RESULTS_SCHEMA: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['eventId', 'projectId', 'runId', 'headSha', 'testId', 'outcome', 'ts'],
    properties: {
      eventId: { bsonType: 'string' },
      projectId: { bsonType: 'string' },
      runId: { bsonType: 'string' },
      headSha: { bsonType: 'string' },
      testId: { bsonType: 'string' },
      file: { bsonType: 'string' },
      outcome: { enum: ['pass', 'fail', 'skipped'] },
      durationMs: { bsonType: 'number' },
      errorMessage: { bsonType: ['string', 'null'] },
      ts: { bsonType: 'date' }
    }
  }
};

export const INGEST_EVENTS_SCHEMA: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['eventId', 'source', 'type', 'status', 'receivedAt'],
    properties: {
      eventId: { bsonType: 'string' },
      projectId: { bsonType: ['string', 'null'] },
      source: { bsonType: 'string' },
      type: { bsonType: 'string' },
      status: { enum: ['received', 'processed', 'failed', 'duplicate'] },
      receivedAt: { bsonType: 'date' },
      error: { bsonType: ['string', 'null'] }
    }
  }
};
