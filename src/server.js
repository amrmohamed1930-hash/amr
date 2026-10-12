import { createApp } from './app.js';
import { config } from './config/env.js';
import { ping, closePool } from './config/db.js';

const start = async () => {
  try {
    const dbUp = await ping();
    if (!dbUp) {
      console.error('[startup] Could not reach MySQL.');
      console.error(`[startup] target: ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`);
      process.exit(1);
    }
    console.log(`[startup] MySQL connected (${config.db.database})`);
  } catch (err) {
    console.error('[startup] MySQL connection failed:', err.message);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`[startup] Watanya Store API listening on http://${config.host}:${config.port}`);
    console.log(`[startup] Health: http://localhost:${config.port}/api/health`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[${signal}] shutting down...`);
    server.close(async () => {
      await closePool();
      console.log('[shutdown] closed cleanly');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
};

start();
