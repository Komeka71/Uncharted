import { Response } from 'express';
import { Db, ChangeStream } from 'mongodb';
import { isDbConnected } from '../db/client.js';

interface SSEClient {
  id: string;
  res: Response;
}

const clients: Map<string, SSEClient> = new Map();
let changeStream: ChangeStream | null = null;

export function addSSEClient(id: string, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', id, timestamp: new Date().toISOString() })}\n\n`);

  clients.set(id, { id, res });

  res.on('close', () => {
    clients.delete(id);
  });
}

export function broadcastSSE(type: string, data: any): void {
  const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) {
    try {
      client.res.write(message);
    } catch (err) {
      clients.delete(client.id);
    }
  }
}

export function initChangeStreams(db: Db): void {
  try {
    // Watch failures collection for real-time inserts
    changeStream = db.collection('failures').watch([
      { $match: { operationType: 'insert' } }
    ]);

    changeStream.on('change', (change: any) => {
      if (change.fullDocument) {
        broadcastSSE('new_failure', {
          failureId: change.fullDocument.failureId,
          projectId: change.fullDocument.projectId,
          signature: change.fullDocument.signature,
          category: change.fullDocument.category,
          ruleId: change.fullDocument.ruleId,
          createdAt: change.fullDocument.createdAt
        });
      }
    });

    changeStream.on('error', (err: any) => {
      console.warn('[SSE] MongoDB Change Streams not supported on this deployment (standalone mode):', err.message);
      if (changeStream) {
        changeStream.close();
        changeStream = null;
      }
    });

    console.log('[SSE] MongoDB change stream listener initialized.');
  } catch (err: any) {
    console.warn('[SSE] MongoDB change stream initialization skipped:', err.message);
  }
}
