const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

// Criar diretório de logs se não existir
const logsDir = path.resolve(config.paths.logs);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Formato customizado para logs
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  
  // Adicionar metadata se existir
  if (Object.keys(metadata).length > 0) {
    msg += '\n' + JSON.stringify(metadata, null, 2);
  }
  
  return msg;
});

// Configuração para arquivo de logs diários
const dailyRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'monitor-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d', // Manter logs por 14 dias
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  )
});

// Configuração para arquivo de erros
const errorFileTransport = new winston.transports.File({
  filename: path.join(logsDir, 'errors.log'),
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  )
});

// Configuração para console
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  )
});

// Criar logger
const logger = winston.createLogger({
  level: config.system.logLevel,
  transports: [
    dailyRotateTransport,
    errorFileTransport,
    consoleTransport
  ]
});

// Funções auxiliares para logging estruturado
logger.logMonitorStart = () => {
  logger.info('🚀 Monitor PIX For4 iniciado', {
    interval: `${config.monitor.intervalMinutes} minutos`,
    timeout: `${config.monitor.requestTimeout}ms`,
    environment: config.system.env
  });
};

logger.logCheckStart = (trackingId) => {
  logger.info('🔍 Iniciando verificação de saúde', { trackingId });
};

logger.logCheckSuccess = (data) => {
  logger.info('✅ Verificação concluída com sucesso', {
    trackingId: data.trackingId,
    pixCode: data.pixCode ? 'Gerado' : 'Não gerado',
    responseTime: data.responseTime,
    transactionId: data.transactionId
  });
};

logger.logCheckError = (error, context) => {
  logger.error('❌ Erro na verificação de saúde', {
    error: error.message,
    type: error.type || 'UNKNOWN',
    context,
    stack: error.stack
  });
};

logger.logNotificationSent = (type, message) => {
  logger.info('📨 Notificação enviada ao Telegram', { type, message });
};

logger.logNotificationError = (error) => {
  logger.error('📨 Erro ao enviar notificação', {
    error: error.message,
    stack: error.stack
  });
};

module.exports = logger;