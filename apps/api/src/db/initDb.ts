import { Db } from 'mongodb';
import { getDb, connectDb } from './client.js';
import { RUNS_SCHEMA, FAILURES_SCHEMA, TEST_RESULTS_SCHEMA, INGEST_EVENTS_SCHEMA } from './schema.js';

export async function initDb(): Promise<Db | null> {
  let db: Db;
  try {
    db = await connectDb();
  } catch (err: any) {
    console.warn(`[initDb] MongoDB connection failed: ${err.message}. Running in offline/memory fallback mode.`);
    return null;
  }

  try {
    const existingCollections = await db.listCollections().toArray();
    const existingNames = new Set(existingCollections.map((c: any) => c.name));

    // Helper to ensure collection with schema
    const ensureCollection = async (name: string, validator?: object) => {
      if (!existingNames.has(name)) {
        if (validator) {
          await db.createCollection(name, {
            validator,
            validationLevel: 'moderate',
            validationAction: 'warn'
          });
        } else {
          await db.createCollection(name);
        }
      }
    };

    await ensureCollection('projects');
    await ensureCollection('runs', RUNS_SCHEMA);
    await ensureCollection('failures', FAILURES_SCHEMA);
    await ensureCollection('signatures');
    await ensureCollection('testResults', TEST_RESULTS_SCHEMA);
    await ensureCollection('diagnoses');
    await ensureCollection('agentSteps');
    await ensureCollection('logs');
    await ensureCollection('ingestEvents', INGEST_EVENTS_SCHEMA);
    await ensureCollection('jobQueue');

    // Create Indexes
    console.log('[initDb] Creating database indexes...');

    // projects: unique { 'repo.owner': 1, 'repo.name': 1 }
    await db.collection('projects').createIndex({ 'repo.owner': 1, 'repo.name': 1 }, { unique: true, sparse: true });
    await db.collection('projects').createIndex({ ingestToken: 1 });

    // runs: unique { projectId: 1, runId: 1 }, { projectId: 1, startedAt: -1 }
    await db.collection('runs').createIndex({ projectId: 1, runId: 1 }, { unique: true });
    await db.collection('runs').createIndex({ projectId: 1, startedAt: -1 });
    await db.collection('runs').createIndex({ projectId: 1, workflow: 1, branch: 1, startedAt: -1 });

    // failures: { projectId: 1, createdAt: -1 }, { projectId: 1, signature: 1 }, { runId: 1 }
    await db.collection('failures').createIndex({ projectId: 1, createdAt: -1 });
    await db.collection('failures').createIndex({ projectId: 1, signature: 1 });
    await db.collection('failures').createIndex({ runId: 1 });
    await db.collection('failures').createIndex({ failureId: 1 }, { unique: true });

    // signatures: unique { projectId: 1, signature: 1 }
    await db.collection('signatures').createIndex({ projectId: 1, signature: 1 }, { unique: true });
    await db.collection('signatures').createIndex({ projectId: 1, lastSeenAt: -1 });

    // testResults: unique { eventId: 1 }, { projectId: 1, testId: 1, ts: -1 }
    await db.collection('testResults').createIndex({ eventId: 1 }, { unique: true });
    await db.collection('testResults').createIndex({ projectId: 1, testId: 1, ts: -1 });
    await db.collection('testResults').createIndex({ projectId: 1, headSha: 1, testId: 1 });

    // diagnoses: { failureId: 1, version: -1 }
    await db.collection('diagnoses').createIndex({ failureId: 1, version: -1 });
    await db.collection('diagnoses').createIndex({ diagnosisId: 1 }, { unique: true });

    // agentSteps: { failureId: 1, seq: 1 }
    await db.collection('agentSteps').createIndex({ failureId: 1, seq: 1 });

    // logs: TTL index on createdAt (14 days)
    await db.collection('logs').createIndex({ runId: 1, jobName: 1, chunkIndex: 1 });
    await db.collection('logs').createIndex({ createdAt: 1 }, { expireAfterSeconds: 14 * 86400 });

    // ingestEvents: unique { eventId: 1 }
    await db.collection('ingestEvents').createIndex({ eventId: 1 }, { unique: true });

    // jobQueue: { status: 1, runAfter: 1 }
    await db.collection('jobQueue').createIndex({ status: 1, runAfter: 1 });

    console.log('[initDb] MongoDB collections, schemas, and indexes initialized successfully.');
    return db;
  } catch (err: any) {
    console.error(`[initDb] Error configuring database: ${err.message}`);
    return db;
  }
}
