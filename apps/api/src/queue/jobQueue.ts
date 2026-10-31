import { Db, ObjectId } from 'mongodb';
import { getDb, isDbConnected } from '../db/client.js';

export interface Job<T = any> {
  _id?: ObjectId | string;
  type: string;
  payload: T;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  lockedAt?: Date;
  runAfter: Date;
  createdAt: Date;
  error?: string;
}

type JobHandler<T = any> = (payload: T) => Promise<void>;

const handlers = new Map<string, JobHandler>();
let isWorkerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

// In-memory queue fallback if MongoDB is offline
const memoryQueue: Job[] = [];

export function registerJobHandler<T>(type: string, handler: JobHandler<T>): void {
  handlers.set(type, handler);
}

export async function enqueueJob<T>(
  type: string,
  payload: T,
  delayMs = 0,
  maxAttempts = 3
): Promise<string> {
  const job: Job<T> = {
    type,
    payload,
    status: 'pending',
    attempts: 0,
    maxAttempts,
    runAfter: new Date(Date.now() + delayMs),
    createdAt: new Date()
  };

  if (isDbConnected()) {
    try {
      const db = getDb();
      const res = await db.collection('jobQueue').insertOne(job as any);
      return res.insertedId.toString();
    } catch (err) {
      console.warn('[JobQueue] Failed to enqueue into MongoDB, using memory queue:', err);
    }
  }

  // Fallback memory queue
  const memId = new ObjectId().toString();
  job._id = memId;
  memoryQueue.push(job);
  return memId;
}

export async function processNextJob(): Promise<boolean> {
  let job: Job | null = null;
  const now = new Date();

  if (isDbConnected()) {
    try {
      const db = getDb();
      const res = await db.collection<Job>('jobQueue').findOneAndUpdate(
        {
          status: 'pending',
          runAfter: { $lte: now }
        },
        {
          $set: {
            status: 'running',
            lockedAt: now
          },
          $inc: { attempts: 1 }
        },
        { returnDocument: 'after' }
      );
      job = res || null;
    } catch (err: any) {
      console.warn('[JobQueue] Error fetching job from DB:', err.message);
    }
  }

  if (!job) {
    // Check in-memory queue
    const memIdx = memoryQueue.findIndex((j) => j.status === 'pending' && j.runAfter <= now);
    if (memIdx !== -1) {
      job = memoryQueue[memIdx];
      job.status = 'running';
      job.lockedAt = now;
      job.attempts += 1;
    }
  }

  if (!job) {
    return false; // No work pending
  }

  const handler = handlers.get(job.type);
  if (!handler) {
    console.error(`[JobQueue] No handler registered for job type: ${job.type}`);
    await markJobFailed(job, `No handler registered for job type: ${job.type}`);
    return true;
  }

  try {
    await handler(job.payload);
    await markJobCompleted(job);
    return true;
  } catch (err: any) {
    console.error(`[JobQueue] Job ${job.type} failed (attempt ${job.attempts}):`, err.message);
    if (job.attempts < job.maxAttempts) {
      // Exponential backoff retry
      const backoffSec = Math.pow(2, job.attempts) * 2;
      await retryJob(job, backoffSec, err.message);
    } else {
      await markJobFailed(job, err.message);
    }
    return true;
  }
}

async function markJobCompleted(job: Job): Promise<void> {
  job.status = 'completed';
  if (isDbConnected() && job._id && typeof job._id !== 'string') {
    try {
      const db = getDb();
      await db.collection('jobQueue').updateOne({ _id: job._id }, { $set: { status: 'completed' } });
    } catch (err) {
      // ignore
    }
  }
}

async function markJobFailed(job: Job, error: string): Promise<void> {
  job.status = 'failed';
  job.error = error;
  if (isDbConnected() && job._id && typeof job._id !== 'string') {
    try {
      const db = getDb();
      await db.collection('jobQueue').updateOne({ _id: job._id }, { $set: { status: 'failed', error } });
    } catch (err) {
      // ignore
    }
  }
}

async function retryJob(job: Job, backoffSec: number, error: string): Promise<void> {
  job.status = 'pending';
  job.runAfter = new Date(Date.now() + backoffSec * 1000);
  job.error = error;

  if (isDbConnected() && job._id && typeof job._id !== 'string') {
    try {
      const db = getDb();
      await db.collection('jobQueue').updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'pending',
            runAfter: job.runAfter,
            error
          }
        }
      );
    } catch (err) {
      // ignore
    }
  }
}

export function startWorkerLoop(intervalMs = 500): void {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  workerInterval = setInterval(async () => {
    try {
      let processed = true;
      while (processed) {
        processed = await processNextJob();
      }
    } catch (err) {
      // Worker cycle exception caught
    }
  }, intervalMs);

  console.log('[JobQueue] Worker loop started.');
}

export function stopWorkerLoop(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  isWorkerRunning = false;
  console.log('[JobQueue] Worker loop stopped.');
}
