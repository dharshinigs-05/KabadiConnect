import { createServer } from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { initSocket } from './socket/events.js';
import { closePool } from './lib/db.js';

const app = createApp();
const httpServer = createServer(app);

initSocket(httpServer, env.CORS_ORIGIN);

httpServer.listen(env.PORT, () => {
  logger.info('KabadiConnect backend started', {
    port: env.PORT,
    env: env.NODE_ENV,
    mockAuth: env.USE_MOCK_AUTH,
    mockMl: env.USE_MOCK_ML,
    demoRegion: env.DEFAULT_DEMO_REGION,
  });
});

async function shutdown(signal: string) {
  logger.info('Shutting down', { signal });
  httpServer.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
