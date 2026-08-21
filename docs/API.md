# Mail2WhatsApp AI — API Reference & Contracts

## 1. Authentication & Security Headers

All protected endpoints require a Bearer token in the `Authorization` header:
```http
Authorization: Bearer <jwt_token>
```
All API responses include the tracing header:
```http
X-Request-ID: <uuid4>
```

## 2. Health & Observability Endpoints

### `GET /health/live`
- **Purpose**: Liveness probe. Returns HTTP 200 if process is running.

### `GET /health/ready`
- **Purpose**: Readiness probe. Validates database connectivity and internal locks.
```json
{
  "status": "READY",
  "database": "connected",
  "uptime": 12450.2,
  "timestamp": "2026-08-21T13:45:00.000Z"
}
```

### `GET /health/dependencies`
- **Purpose**: Deep dependency diagnostic. Checks Meta WhatsApp, Google OAuth, and LLM configuration.

### `GET /metrics`
- **Format**: Prometheus format by default, JSON format with `?format=json`.

## 3. Core API Endpoints

### `POST /api/sync`
Manually triggers inbox synchronization for authenticated user.
```json
{
  "success": true,
  "added": 2,
  "skipped": 5
}
```

### `GET /api/emails`
Returns summarized email feed for the authenticated user.

### `POST /api/settings`
Updates AI triage preferences, language, notification threshold, and WhatsApp destination number.
