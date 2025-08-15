const fs = require('fs').promises;
const path = require('path');
const moment = require('moment-timezone');
const config = require('./config/config');
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');
const for4Service = require('./services/for4Service');
const telegramService = require('./services/telegramService');
const { generateTrackingId, isWithinMonitoringHours, formatCurrency } = require('./utils/dataGenerator');

// Configurar timezone
moment.tz.setDefault(config.system.timezone);

class PixMonitor {
  constructor() {
    this.stats = {
      startTime: Date.now(),
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      totalResponseTime: 0,
      errors: [],
      lastCheck: null,
      lastError: null,
      isHealthy: true
    };
    
    this.statsFile = path.join(config.paths.data, 'monitor-stats.json');
    this.isRunning = false;
    this.isPaused = false;
  }

  /**
   * Inicializa o monitor
   */
  async initialize() {
    try {
      // Criar diretórios necessários
      await this.createDirectories();
      
      // Carregar estatísticas salvas
      await this.loadStats();
      
      // Testar conexões
      logger.info('🔌 Testando conexões...');
      
      // Testar Telegram
      if (config.telegram.enabled) {
        await telegramService.testConnection();
      }
      
      logger.info('✅ Monitor inicializado com sucesso');
      
      // Enviar notificação de início
      await telegramService.sendMessage(
        '🚀 **Monitor PIX For4 Iniciado**\n\n' +
        `⏰ Intervalo: ${config.monitor.intervalMinutes} minutos\n` +
        `💰 Valor por teste: ${formatCurrency(config.testTransaction.amount)}\n` +
        `🌍 Ambiente: ${config.system.env}\n` +
        `📅 Horário: ${moment().format('DD/MM/YYYY HH:mm:ss')}`
      );
      
      return true;
      
    } catch (error) {
      logger.error('❌ Erro ao inicializar monitor', { error: error.message });
      throw error;
    }
  }

  /**
   * Cria diretórios necessários
   */
  async createDirectories() {
    const dirs = [config.paths.logs, config.paths.data];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Carrega estatísticas salvas
   */
  async loadStats() {
    try {
      const data = await fs.readFile(this.statsFile, 'utf8');
      const savedStats = JSON.parse(data);
      
      // Mesclar com stats atuais
      Object.assign(this.stats, savedStats);
      
      logger.info('📊 Estatísticas carregadas', {
        totalChecks: this.stats.totalChecks,
        uptime: this.calculateUptime()
      });
      
    } catch (error) {
      // Arquivo não existe, usar stats padrão
      logger.info('📊 Iniciando com estatísticas novas');
    }
  }

  /**
   * Salva estatísticas
   */
  async saveStats() {
    try {
      await fs.writeFile(this.statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      logger.error('Erro ao salvar estatísticas', { error: error.message });
    }
  }

  /**
   * Executa uma verificação de saúde
   */
  async runHealthCheck() {
    // Verificar se está dentro do horário de monitoramento
    if (!isWithinMonitoringHours(config.monitor.startHour, config.monitor.endHour)) {
      logger.info('⏰ Fora do horário de monitoramento');
      return;
    }
    
    // Verificar se está pausado
    if (this.isPaused) {
      logger.info('⏸️ Monitor pausado');
      return;
    }
    
    const trackingId = generateTrackingId();
    const checkStartTime = Date.now();
    
    logger.logCheckStart(trackingId);
    
    try {
      // Executar verificação
      const result = await for4Service.createPixTransaction(trackingId);
      
      // Atualizar estatísticas
      this.stats.totalChecks++;
      this.stats.successfulChecks++;
      this.stats.totalResponseTime += result.responseTime;
      this.stats.lastCheck = new Date().toISOString();
      
      // Se estava com erro, notificar recuperação
      if (!this.stats.isHealthy) {
        this.stats.isHealthy = true;
        await this.notifyRecovery(result, trackingId);
      }
      
      // Limpar estado de erro
      await errorHandler.clearErrorState();
      
      // Log de sucesso
      logger.logCheckSuccess({
        trackingId,
        pixCode: result.data.pixCode,
        responseTime: result.responseTime,
        transactionId: result.data.id
      });
      
      // Salvar estatísticas
      await this.saveStats();
      
    } catch (error) {
      // Atualizar estatísticas de erro
      this.stats.totalChecks++;
      this.stats.failedChecks++;
      this.stats.lastCheck = new Date().toISOString();
      this.stats.isHealthy = false;
      
      // Processar erro
      const errorInfo = await errorHandler.handleError(error, { trackingId });
      
      // Adicionar aos erros do dia
      this.stats.errors.push({
        time: moment().format('HH:mm:ss'),
        type: errorInfo.type,
        message: error.message,
        trackingId
      });
      
      // Limitar array de erros a 100 últimos
      if (this.stats.errors.length > 100) {
        this.stats.errors = this.stats.errors.slice(-100);
      }
      
      this.stats.lastError = {
        time: moment().format('DD/MM/YYYY HH:mm:ss'),
        type: errorInfo.type,
        message: error.message
      };
      
      // Notificar se necessário
      if (errorInfo.shouldNotify) {
        await telegramService.sendErrorAlert(errorInfo.message, { trackingId });
      }
      
      // Log de erro
      logger.logCheckError(error, { trackingId, errorType: errorInfo.type });
      
      // Salvar estatísticas
      await this.saveStats();
    }
    
    // Log de tempo de execução
    const checkDuration = Date.now() - checkStartTime;
    logger.info(`⏱️ Verificação concluída em ${checkDuration}ms`);
  }

  /**
   * Notifica recuperação do sistema
   */
  async notifyRecovery(result, trackingId) {
    const message = errorHandler.formatRecoveryMessage({
      trackingId,
      pixCode: result.data.pixCode,
      responseTime: result.responseTime,
      transactionId: result.data.id
    });
    
    await telegramService.sendRecoveryAlert(message);
  }

  /**
   * Calcula uptime percentual
   */
  calculateUptime() {
    if (this.stats.totalChecks === 0) return 100;
    
    return ((this.stats.successfulChecks / this.stats.totalChecks) * 100).toFixed(2);
  }

  /**
   * Calcula tempo médio de resposta
   */
  calculateAverageResponseTime() {
    if (this.stats.successfulChecks === 0) return 0;
    
    return Math.round(this.stats.totalResponseTime / this.stats.successfulChecks);
  }

  /**
   * Gera relatório diário
   */
  async generateDailyReport() {
    const today = moment().startOf('day');
    const todayErrors = this.stats.errors.filter(error => {
      return moment(error.time, 'HH:mm:ss').isSame(today, 'day');
    });
    
    const report = {
      date: today.format('DD/MM/YYYY'),
      checks: {
        total: this.stats.totalChecks,
        success: this.stats.successfulChecks,
        failed: this.stats.failedChecks
      },
      errors: todayErrors,
      uptime: this.calculateUptime(),
      avgResponseTime: this.calculateAverageResponseTime(),
      totalCost: this.stats.totalChecks * (config.testTransaction.amount / 100)
    };
    
    // Enviar relatório via Telegram
    await telegramService.sendDailyReport(report);
    
    // Salvar relatório em arquivo
    const reportFile = path.join(
      config.paths.data,
      `report-${today.format('YYYY-MM-DD')}.json`
    );
    
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    logger.info('📊 Relatório diário gerado', { date: report.date });
    
    return report;
  }

  /**
   * Obtém status atual do monitor
   */
  async getStatus() {
    const checksToday = this.stats.errors.filter(error => {
      return moment(error.time, 'HH:mm:ss').isSame(moment(), 'day');
    }).length;
    
    return {
      isHealthy: this.stats.isHealthy,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      lastCheck: this.stats.lastCheck ? moment(this.stats.lastCheck).format('DD/MM/YYYY HH:mm:ss') : 'Nunca',
      checksToday: checksToday,
      costToday: checksToday * (config.testTransaction.amount / 100),
      uptime: this.calculateUptime(),
      avgResponseTime: this.calculateAverageResponseTime(),
      lastError: this.stats.lastError
    };
  }

  /**
   * Pausa o monitor
   */
  pause() {
    this.isPaused = true;
    logger.info('⏸️ Monitor pausado');
  }

  /**
   * Retoma o monitor
   */
  resume() {
    this.isPaused = false;
    logger.info('▶️ Monitor retomado');
  }

  /**
   * Para o monitor
   */
  async stop() {
    this.isRunning = false;
    await this.saveStats();
    
    await telegramService.sendMessage(
      '🛑 **Monitor PIX For4 Parado**\n\n' +
      `📊 Total de verificações: ${this.stats.totalChecks}\n` +
      `✅ Sucesso: ${this.stats.successfulChecks}\n` +
      `❌ Falhas: ${this.stats.failedChecks}\n` +
      `📈 Uptime: ${this.calculateUptime()}%`
    );
    
    logger.info('🛑 Monitor parado');
  }

  /**
   * Executa verificação única (para testes)
   */
  async runOnce() {
    logger.info('🧪 Executando verificação única');
    await this.runHealthCheck();
  }
}

module.exports = new PixMonitor();