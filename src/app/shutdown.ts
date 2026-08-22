import { Server } from 'http';
import { stopOutboxWorker } from '../services/whatsapp/outbox.worker';
import { closeQueues } from '../services/queue/queue.service';
import { getDb } from '../database/db';

export function setupGracefulShutdown(server: Server) {
  async function handleGracefulShutdown(signal: string) {
    console.log(`\n🛑 Received ${signal}. Commencing graceful shutdown sequence...`);
    
    server.close(async () => {
      console.log('HTTP Server closed.');
      stopOutboxWorker();
      await closeQueues();
      
      try {
        const database = await getDb();
        database.close();
        console.log('Database connection closed.');
      } catch (e) {}

      console.log('✅ Graceful shutdown complete. Exiting.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('⚠️ Forcing process exit after timeout.');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
}
