module.exports = {
  apps: [{
    name: 'for4-pix-monitor',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    
    // Estratégia de restart
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Cron restart - reiniciar diariamente às 04:00
    cron_restart: '0 4 * * *',
    
    // Monitoramento de CPU/Memória
    monitoring: true,
    
    // Kill timeout
    kill_timeout: 5000,
    
    // Graceful shutdown
    listen_timeout: 3000,
    shutdown_with_message: true
  }]
};