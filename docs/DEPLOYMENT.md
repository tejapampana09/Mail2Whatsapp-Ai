# Mail2WhatsApp AI — Production Deployment Guide

## 1. Prerequisites
- Ubuntu 22.04 / 24.04 LTS (AWS EC2)
- Node.js 20 LTS or Docker & Docker Compose
- Caddy Reverse Proxy with automated Let's Encrypt SSL
- Meta Developer Account with WhatsApp Cloud API configured

## 2. PM2 Host Deployment

```bash
git clone https://github.com/YourOrg/mail2whatsapp-ai.git
cd mail2whatsapp-ai
npm ci --production=false
npm run build
npm run lint

# Start with PM2
pm2 start dist/server.js --name "mail2whatsapp" --max-memory-restart 500M
pm2 save
pm2 startup
```

## 3. Docker Production Deployment

```bash
docker compose -f docker-compose.production.yml up -d --build
```
