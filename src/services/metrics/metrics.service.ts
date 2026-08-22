import { getOutboxStats } from '../../database/db';

class MetricsService {
  private counters = {
    http_requests_total: 0,
    emails_received_total: 0,
    emails_processed_total: 0,
    emails_failed_total: 0,
    ai_requests_total: 0,
    ai_failures_total: 0,
    whatsapp_sent_total: 0,
    whatsapp_failed_total: 0,
    whatsapp_retry_total: 0,
    gmail_sync_total: 0,
    gmail_sync_failures: 0,
    pubsub_received_total: 0,
    pubsub_duplicate_total: 0,
    worker_runs_total: 0,
    worker_errors_total: 0
  };

  private latencies: number[] = [];

  increment(metric: keyof typeof this.counters, amount = 1) {
    if (this.counters[metric] !== undefined) {
      this.counters[metric] += amount;
    }
  }

  recordLatency(ms: number) {
    this.latencies.push(ms);
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  async getMetricsJSON() {
    const avgLatency = this.latencies.length > 0 
      ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length) 
      : 0;

    let outboxStats = { pending: 0, processing: 0, sent: 0, deadLetter: 0, failed: 0 };
    try {
      outboxStats = await getOutboxStats();
    } catch (_) {}

    return {
      ...this.counters,
      outbox_pending: outboxStats.pending,
      outbox_processing: outboxStats.processing,
      outbox_dead_letter: outboxStats.deadLetter,
      whatsapp_latency_avg_ms: avgLatency,
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage_bytes: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  async getPrometheusFormat(): Promise<string> {
    const metrics = await this.getMetricsJSON();
    const lines = [
      '# HELP mail2whatsapp_emails_received_total Total number of incoming emails received',
      '# TYPE mail2whatsapp_emails_received_total counter',
      'mail2whatsapp_emails_received_total ' + metrics.emails_received_total,
      '# HELP mail2whatsapp_emails_processed_total Total number of emails processed through AI triage',
      '# TYPE mail2whatsapp_emails_processed_total counter',
      'mail2whatsapp_emails_processed_total ' + metrics.emails_processed_total,
      '# HELP mail2whatsapp_email_failures_total Total email processing failures',
      '# TYPE mail2whatsapp_email_failures_total counter',
      'mail2whatsapp_email_failures_total ' + metrics.emails_failed_total,
      '# HELP mail2whatsapp_outbox_pending Current number of pending outbox messages',
      '# TYPE mail2whatsapp_outbox_pending gauge',
      'mail2whatsapp_outbox_pending ' + metrics.outbox_pending,
      '# HELP mail2whatsapp_outbox_processing Current number of outbox messages being dispatched',
      '# TYPE mail2whatsapp_outbox_processing gauge',
      'mail2whatsapp_outbox_processing ' + metrics.outbox_processing,
      '# HELP mail2whatsapp_outbox_dead_letter_total Total messages moved to dead letter queue',
      '# TYPE mail2whatsapp_outbox_dead_letter_total counter',
      'mail2whatsapp_outbox_dead_letter_total ' + metrics.outbox_dead_letter,
      '# HELP mail2whatsapp_whatsapp_success_total Total WhatsApp messages successfully dispatched',
      '# TYPE mail2whatsapp_whatsapp_success_total counter',
      'mail2whatsapp_whatsapp_success_total ' + metrics.whatsapp_sent_total,
      '# HELP mail2whatsapp_whatsapp_failure_total Total WhatsApp delivery failures',
      '# TYPE mail2whatsapp_whatsapp_failure_total counter',
      'mail2whatsapp_whatsapp_failure_total ' + metrics.whatsapp_failed_total,
      '# HELP mail2whatsapp_whatsapp_latency_ms Average WhatsApp delivery latency in milliseconds',
      '# TYPE mail2whatsapp_whatsapp_latency_ms gauge',
      'mail2whatsapp_whatsapp_latency_ms ' + metrics.whatsapp_latency_avg_ms,
      '# HELP mail2whatsapp_pubsub_received_total Total Google Pub/Sub push messages received',
      '# TYPE mail2whatsapp_pubsub_received_total counter',
      'mail2whatsapp_pubsub_received_total ' + metrics.pubsub_received_total,
      '# HELP mail2whatsapp_pubsub_duplicate_total Total Google Pub/Sub duplicate messages suppressed',
      '# TYPE mail2whatsapp_pubsub_duplicate_total counter',
      'mail2whatsapp_pubsub_duplicate_total ' + metrics.pubsub_duplicate_total,
      '# HELP mail2whatsapp_worker_runs_total Total background worker runs executed',
      '# TYPE mail2whatsapp_worker_runs_total counter',
      'mail2whatsapp_worker_runs_total ' + metrics.worker_runs_total,
      '# HELP mail2whatsapp_worker_errors_total Total background worker unhandled errors',
      '# TYPE mail2whatsapp_worker_errors_total counter',
      'mail2whatsapp_worker_errors_total ' + metrics.worker_errors_total,
      '# HELP process_uptime_seconds Process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      'process_uptime_seconds ' + metrics.uptime_seconds
    ];
    return lines.join('\n') + '\n';
  }
}

export const metricsService = new MetricsService();
