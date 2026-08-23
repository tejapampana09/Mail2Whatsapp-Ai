#!/usr/bin/env bash
set -e

echo "🚀 Starting automated deployment on AWS EC2..."

# 1. Ensure NVM and Node 22 LTS are active
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! command -v node >/dev/null 2>&1 || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 22 ]; then
  echo "⚡ Upgrading Node.js to Node 22 LTS on EC2..."
  if command -v nvm >/dev/null 2>&1; then
    nvm install 22
    nvm use 22
    nvm alias default 22
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs build-essential
  fi
fi

echo "Using Node.js $(node -v) and npm $(npm -v) on EC2"

# 2. Navigate to project repository
if [ -d "/home/ubuntu/Mail2Whatsapp-Ai" ]; then
  cd /home/ubuntu/Mail2Whatsapp-Ai
elif [ -d "/home/ubuntu/mail2whatsapp-ai" ]; then
  cd /home/ubuntu/mail2whatsapp-ai
fi

# 3. Pull latest master changes & install dependencies
export NODE_OPTIONS='--max-old-space-size=1024'
git fetch origin master
git reset --hard origin/master

# Validate required production Pub/Sub security configuration.
# Values must already exist in the EC2 .env file.
if [ ! -f .env ]; then
  echo "ERROR: .env file is missing."
  exit 1
fi

PUBSUB_AUDIENCE_VALUE="$(grep '^PUBSUB_AUDIENCE=' .env | cut -d '=' -f2-)"
PUBSUB_SERVICE_ACCOUNT_VALUE="$(grep '^PUBSUB_SERVICE_ACCOUNT=' .env | cut -d '=' -f2-)"

if [ -z "$PUBSUB_AUDIENCE_VALUE" ]; then
  echo "ERROR: PUBSUB_AUDIENCE is missing from .env."
  exit 1
fi

if [ -z "$PUBSUB_SERVICE_ACCOUNT_VALUE" ]; then
  echo "ERROR: PUBSUB_SERVICE_ACCOUNT is missing from .env."
  exit 1
fi

echo "Pub/Sub security configuration verified."

npm install --production=false --no-audit --prefer-offline
npm run build

# 4. Clean start PM2 process using official ecosystem config
pm2 delete mail2whatsapp 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save || true

# 5. Verify local health check with retry polling
echo "🔍 Verifying local application health..."
HEALTHY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 2
  if curl -f -s http://127.0.0.1:3000/health/live >/dev/null || curl -f -s http://localhost:3000/health/live >/dev/null; then
    echo "✅ Local service is healthy and responding on port 3000 (attempt $i/15)!"
    HEALTHY=1
    break
  fi
  echo "⏳ Waiting for service to finish initializing (attempt $i/15)..."
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "⚠️ Health check timed out. Outputting recent PM2 logs:"
  pm2 logs mail2whatsapp --lines 40 --nostream
  exit 1
fi

echo "✅ Deployment successfully completed!"
