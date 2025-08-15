const cron = require('node-cron');
const config = require('./config/config');
const logger = require('./utils/logger');
const monitor = require('./monitor');

// Manipulador de sinais para shutdown gracioso
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Manipulador de erros não capturados
process.on('uncaughtException', (error) => {
  logger.error('❌ Erro não capturado', {
    error: error.message,
    stack: error.stack
  });
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Promise rejeitada não tratada', {
    reason,
    promise
  });
});

// Função de shutdown
async function shutdown() {
  logger.info('🛑 Recebido sinal de shutdown, finalizando...');
  
  try {
    await monitor.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Erro durante shutdown', { error: error.message });
    process.exit(1);
  }
}

// Função principal
async function main() {
  try {
    logger.logMonitorStart();
    
    // Inicializar monitor
    await monitor.initialize();
    
    // Verificar se deve executar teste único
    if (process.argv.includes('--test')) {
      logger.info('🧪 Modo de teste - executando verificação única');
      await monitor.runOnce();
      process.exit(0);
    }
    
    // Executar primeira verificação imediatamente
    logger.info('🏁 Executando primeira verificação');
    await monitor.runHealthCheck();
    
    // Configurar cron job
    const cronExpression = `*/${config.monitor.intervalMinutes} * * * *`;
    logger.info(`⏰ Agendando verificações a cada ${config.monitor.intervalMinutes} minutos`);
    
    const task = cron.schedule(cronExpression, async () => {
      await monitor.runHealthCheck();
    });
    
    // Agendar relatório diário às 23:55
    cron.schedule('55 23 * * *', async () => {
      logger.info('📊 Gerando relatório diário');
      await monitor.generateDailyReport();
    });
    
    // Agendar limpeza de logs antigos às 03:00
    cron.schedule('0 3 * * *', async () => {
      logger.info('🧹 Executando limpeza de logs antigos');
      // A rotação de logs é feita automaticamente pelo winston-daily-rotate-file
    });
    
    // Agendar status resumido a cada 6 horas
    cron.schedule('0 */6 * * *', async () => {
      const status = await monitor.getStatus();
      await telegramService.sendStatusSummary(status);
    });
    
    logger.info('✅ Monitor em execução');
    
    // Manter processo vivo
    process.stdin.resume();
    
  } catch (error) {
    logger.error('❌ Erro fatal ao iniciar monitor', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Comandos CLI extras
if (process.argv.includes('--help')) {
  console.log(`
📊 Monitor PIX For4
==================

Uso:
  npm start          - Inicia o monitor em modo contínuo
  npm test           - Executa uma verificação única
  npm run dev        - Inicia em modo desenvolvimento (com nodemon)
  
Opções:
  --test             - Executa apenas uma verificação e sai
  --help             - Mostra esta mensagem de ajuda

Configuração:
  1. Copie .env.example para .env
  2. Preencha as configurações necessárias
  3. Execute npm start

Comandos PM2:
  npm run pm2:start  - Inicia com PM2
  npm run pm2:stop   - Para o processo PM2
  npm run pm2:logs   - Visualiza logs do PM2
  `);
  process.exit(0);
}

// Iniciar aplicação
main();