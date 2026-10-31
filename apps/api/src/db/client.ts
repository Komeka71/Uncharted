import { MongoClient, Db } from 'mongodb';
import { env } from '../config/env.js';

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;

export async function connectDb(): Promise<Db> {
  if (db && isConnected) {
    return db;
  }

  try {
    client = new MongoClient(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000
    });

    await client.connect();
    db = client.db();
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to database: ${db.databaseName}`);
    return db;
  } catch (err: any) {
    console.warn(`[MongoDB] Warning: Could not connect to MongoDB at ${env.MONGODB_URI}: ${err.message}`);
    isConnected = false;
    throw err;
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectDb() first.');
  }
  return db;
}

export function isDbConnected(): boolean {
  return isConnected;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    isConnected = false;
    console.log('[MongoDB] Connection closed.');
  }
}
