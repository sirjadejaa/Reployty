/**
 * Reployty Production Server Entry Point
 * 
 * Boots the HTTP server, mounts the verified API application,
 * serves the built Vite frontend SPA from dist/, initializes background workers,
 * and coordinates graceful shutdown on SIGTERM / SIGINT signals.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { apiApp } from './api/app';
import { validateEnv } from './config/env';
import { checkDatabaseHealth, disconnectDatabase } from './db/client';
import { workerManager } from './jobs/workerManager';
import { logger } from './utils/logger';

async function bootstrap() {
  // 1. Centralized Environment Validation
  const config = validateEnv();
  logger.info(`Starting Reployty SaaS server in [${config.nodeEnv.toUpperCase()}] mode...`, {
    nodeEnv: config.nodeEnv,
    port: config.port,
    appUrl: config.appUrl,
  });

  // 2. Pre-flight Database Verification
  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.status !== 'healthy') {
    logger.error(`Initial database health check failed: ${dbHealth.error}`, {
      error: dbHealth.error,
    });
    if (config.isProduction) {
      process.exit(1);
    }
  } else {
    logger.info(`Database connectivity verified in ${dbHealth.latencyMs}ms`);
  }

  // 3. Assemble Top-Level Application
  const app = express();

  // Mount API Application on /api and root fallback
  app.use('/api', apiApp);

  // Health and Readiness probes at root level as well
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      system: 'Reployty Multi-Tenant SaaS',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    });
  });

  app.get('/ready', async (_req, res) => {
    const currentDbHealth = await checkDatabaseHealth();
    const isReady = currentDbHealth.status === 'healthy';
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'unready',
      database: currentDbHealth,
      timestamp: new Date().toISOString(),
    });
  });

  // 4. Serve Static SPA Frontend in Production
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    // Cache static hashed assets for 1 year
    app.use('/assets', express.static(path.join(distDir, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Other static files (favicon, manifest, etc.)
    app.use(express.static(distDir, {
      maxAge: '1h',
    }));

    // SPA routing fallback: send index.html for non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    logger.warn('Frontend build folder (dist/) not detected. API routes are operational.');
  }

  // 5. Start Background Workers
  if (!config.isTest) {
    workerManager.startScheduledJobs();
  }

  // 6. Listen on configured port
  const server = app.listen(config.port, () => {
    logger.info(`Reployty Production Server listening on http://localhost:${config.port}`);
  });

  // 7. Graceful Shutdown Management
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Commencing graceful shutdown...`);

    // Stop accepting new background work
    workerManager.stopScheduledJobs();

    // Close HTTP listener
    server.close(async () => {
      logger.info('HTTP server closed.');

      // Disconnect Database
      await disconnectDatabase();
      logger.info('Database connections closed.');

      process.exit(0);
    });

    // Force exit after 10s if stuck
    setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error(`Fatal server bootstrap failure: ${err.message}`, {
    stack: err.stack,
  });
  process.exit(1);
});
