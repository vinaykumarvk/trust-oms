import 'dotenv/config';
import express, { type Request, Response, NextFunction } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requestId } from './middleware/request-id';
import { authMiddleware } from './middleware/auth';
import { registerRoutes } from './routes';
import { pool, dbReady } from './db';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Health probes — zero middleware overhead
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/readiness', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'not ready', database: 'error' });
  }
});

// Middleware stack
app.use(requestId);
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Auth — verifies JWT on all /api/* routes (skips health probes)
app.use(authMiddleware);

// Routes
registerRoutes(app);

// Global error handler
app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status >= 500 ? 'Internal Server Error' : err.message;
  console.error(`[ERROR] ${err.message}`, err.stack);
  res.status(status).json({ error: { code: 'INTERNAL', message, correlation_id: (_req as any).id } });
});

// Start
async function start() {
  try {
    await dbReady;
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.warn('[DB] Database not available:', (err as Error).message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] TrustOMS API listening on port ${PORT}`);
  });
}

start();

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[SHUTDOWN] Received ${signal}, shutting down...`);
  try {
    if (pool && 'end' in pool) await pool.end();
  } catch {}
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
