class MetricsService {
  private counters = {
    http_requests_total: 0,
    emails_processed_total: 0,
    emails_failed_total: 0,
    ai_requests_total: 0,
    ai_failures_total: 0,
    whatsapp_sent_total: 0,
    whatsapp_failed_total: 0,
    whatsapp_retry_total: 0,
    gmail_sync_total: 0,
    gmail_sync_failures: 0
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

  getMetricsJSON() {
    const avgLatency = this.latencies.length > 0 
      ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length) 
      : 0;

    return {
      ...this.counters,
      http_request_avg_latency_ms: avgLatency,
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage_bytes: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  getPrometheusFormat(): string {
    const metrics = this.getMetricsJSON();
    const lines = [
      '# HELP http_requests_total Total number of HTTP requests received',
      '# TYPE http_requests_total counter',
      'http_requests_total ' + metrics.http_requests_total,
      '# HELP emails_processed_total Total number of emails processed',
      '# TYPE emails_processed_total counter',
      'emails_processed_total ' + metrics.emails_processed_total,
      '# HELP whatsapp_sent_total Total WhatsApp messages successfully dispatched',
      '# TYPE whatsapp_sent_total counter',
      'whatsapp_sent_total ' + metrics.whatsapp_sent_total,
      '# HELP whatsapp_failed_total Total WhatsApp delivery failures',
      '# TYPE whatsapp_failed_total counter',
      'whatsapp_failed_total ' + metrics.whatsapp_failed_total,
      '# HELP ai_requests_total Total AI triage requests executed',
      '# TYPE ai_requests_total counter',
      'ai_requests_total ' + metrics.ai_requests_total,
      '# HELP process_uptime_seconds Process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      'process_uptime_seconds ' + metrics.uptime_seconds
    ];
    return lines.join('\n') + '\n';
  }
}

export const metricsService = new MetricsService();
