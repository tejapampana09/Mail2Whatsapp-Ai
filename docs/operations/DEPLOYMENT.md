# Mail2WhatsApp AI — Deployment Guide

## 1. Production Prerequisites
- Node.js 20 LTS or higher
- SQLite 3 with WAL support
- HTTPS domain (e.g. `whatsapp2mail.duckdns.org`) with SSL reverse proxy (Nginx or Caddy)
- Meta WhatsApp Business Cloud API App
- Google Cloud Console Project with Gmail API & Cloud Pub/Sub enabled

## 2. Standalone PM2 Deployment
```bash
# Clone and build
git clone https://github.com/tejapampana09/Mail2Whatsapp-Ai.git
cd Mail2Whatsapp-Ai
npm ci
npm run build

# Start with PM2
pm2 start dist/server.js --name "mail2whatsapp" --env production
# Or using tsx directly:
pm2 start "npm start" --name "mail2whatsapp"
pm2 save
pm2 startup
```

## 3. Docker Compose Deployment
```bash
docker compose -f docker-compose.production.yml up -d --build
```
