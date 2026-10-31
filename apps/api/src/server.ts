import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { initDb } from './db/initDb.js';
import { isDbConnected } from './db/client.js';
import { startWorkerLoop, stopWorkerLoop } from './queue/jobQueue.js';
import { initChangeStreams } from './services/sse.js';

// Route imports
import analyzeRoutes from './routes/analyze.js';
import projectsRoutes from './routes/projects.js';
import webhooksRoutes from './routes/webhooks.js';
import ingestRoutes from './routes/ingest.js';
import failuresRoutes from './routes/failures.js';
import signaturesRoutes from './routes/signatures.js';
import statsRoutes from './routes/stats.js';
import flakyRoutes from './routes/flaky.js';
import streamRoutes from './routes/stream.js';
import demoRoutes from './routes/demo.js';

const app = express();

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS configuration
app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Hub-Signature-256', 'X-GitHub-Event']
  })
);

// Capture raw body for GitHub HMAC verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (satisfies Render keep-warm and uptime monitoring)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'Culprit API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: isDbConnected() ? 'connected' : 'disconnected',
    version: '1.0.0',
    hackathon: 'UNCHARTED 2026'
  });
});

// Mount API routes
app.use('/api/analyze', analyzeRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/failures', failuresRoutes);
app.use('/api/signatures', signaturesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/flaky', flakyRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/demo', demoRoutes);

// Global 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint does not exist on Culprit API server'
    }
  });
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Culprit API Error]:', err);
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred'
    }
  });
});

// Bootstrapping
async function bootstrap() {
  const port = env.PORT || 4000;

  // Initialize DB and indexes
  const db = await initDb();
  if (db) {
    initChangeStreams(db);
  }

  // Start in-process job worker loop
  startWorkerLoop(1000);

  const server = app.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 CULPRIT API Server running on port ${port}`);
    console.log(`   Health: http://localhost:${port}/health`);
    console.log(`   SSE Stream: http://localhost:${port}/api/stream`);
    console.log(`   Mode: ${env.NODE_ENV}`);
    console.log(`======================================================\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nGracefully shutting down Culprit API...');
    stopWorkerLoop();
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Start server if this is the main module
bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
});

export default app;
