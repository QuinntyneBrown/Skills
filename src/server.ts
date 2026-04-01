import { createApp } from './app';
import { config } from './config/index';
import { getRedis, closeRedis } from './config/redis';
import { closePool } from './config/database';
import { logger } from './utils/logger';

async function start(): Promise<void> {
  const app = createApp();

  // Connect Redis
  try {
    await getRedis().connect();
    logger.info('Redis connection established');
  } catch (err) {
    logger.warn('Redis connection failed, continuing without cache', {
      error: (err as Error).message,
    });
  }

  // Start HTTP server
  const server = app.listen(config.api.port, config.api.host, () => {
    logger.info('Skills API server started', {
      host: config.api.host,
      port: config.api.port,
      env: config.env,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await closeRedis();
        logger.info('Redis connection closed');
      } catch (err) {
        logger.error('Error closing Redis', { error: (err as Error).message });
      }

      try {
        await closePool();
        logger.info('Database pool closed');
      } catch (err) {
        logger.error('Error closing database pool', { error: (err as Error).message });
      }

      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal('Unhandled rejection', { error: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.fatal('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

start().catch((err) => {
  logger.fatal('Failed to start server', { error: err.message });
  process.exit(1);
});
