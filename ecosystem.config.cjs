module.exports = {
  apps: [
    {
      name: 'mail2whatsapp',
      script: 'node_modules/.bin/tsx',
      args: 'src/app/server.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100
    }
  ]
};
