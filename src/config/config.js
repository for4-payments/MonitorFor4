require('dotenv').config();

const config = {
  // API For4
  for4: {
    apiUrl: process.env.FOR4_API_URL || 'https://example.com.br/api/v1',
    secretKey: process.env.FOR4_SECRET_KEY,
    endpoints: {
      createToken: '/transaction.createCardToken',
      purchase: '/transaction.purchase',
      getPayment: '/transaction.getPayment'
    }
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    enabled: process.env.ENABLE_NOTIFICATIONS === 'true'
  },

  // Monitor
  monitor: {
    intervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 15,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000,
    notificationCooldownMinutes: parseInt(process.env.NOTIFICATION_COOLDOWN_MINUTES) || 30,
    startHour: process.env.MONITOR_START_HOUR ? parseInt(process.env.MONITOR_START_HOUR) : null,
    endHour: process.env.MONITOR_END_HOUR ? parseInt(process.env.MONITOR_END_HOUR) : null
  },

  // Transação de Teste
  testTransaction: {
    amount: 500, // R$ 5,00 - valor mínimo
    item: {
      unitPrice: 500,
      title: 'Health Check PIX - For4 Monitor',
      quantity: 1,
      tangible: false
    }
  },

  // Sistema
  system: {
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    timezone: 'America/Sao_Paulo'
  },

  // Diretórios
  paths: {
    logs: './logs',
    data: './data'
  }
};

// Validações
const requiredConfigs = [
  { key: 'for4.secretKey', value: config.for4.secretKey },
  { key: 'telegram.botToken', value: config.telegram.botToken },
  { key: 'telegram.chatId', value: config.telegram.chatId }
];

const missingConfigs = requiredConfigs
  .filter(({ value }) => !value)
  .map(({ key }) => key);

if (missingConfigs.length > 0) {
  console.error('❌ Configurações obrigatórias faltando:', missingConfigs.join(', '));
  console.error('📋 Copie o arquivo .env.example para .env e preencha as configurações');
  process.exit(1);
}

module.exports = config;