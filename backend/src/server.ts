/**
 * Main Server Entry Point
 * Initializes HTTP server, sockets, background background workers, and graceful shutdown handlers.
 */

import http from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { initSocket } from './realtime/io';
import { startReminderWorker } from './jobs/reminderWorker';

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  await initSocket(server);
  const stopWorker = startReminderWorker();

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 TaskForge API listening on http://localhost:${config.port} (${config.env})`);
    console.log(`   CORS origin: ${config.clientOrigin}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down`);
    stopWorker();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal boot error', err);
  process.exit(1);
});