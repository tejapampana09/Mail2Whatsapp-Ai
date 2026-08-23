module.exports = {
  apps: [
    {
      name: 'mail2whatsapp',
      script: 'node_modules/.bin/tsx',
      args: 'src/app/server.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PUBSUB_AUDIENCE: 'https://whatsapp2mail.duckdns.org/webhook/gmail',
        PUBSUB_SERVICE_ACCOUNT: 'mail2whatsapp-pubsub@mail2whatsapp.iam.gserviceaccount.com'
      },
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100
    }
  ]
};
