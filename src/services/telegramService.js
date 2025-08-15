const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class TelegramService {
  constructor() {
    this.baseURL = `https://api.telegram.org/bot${config.telegram.botToken}`;
    this.chatId = config.telegram.chatId;
    this.enabled = config.telegram.enabled;

    // Cliente axios para Telegram
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000 // 10 segundos
    });

    // Log de inicialização
    if (this.enabled) {
      logger.info('📱 Serviço Telegram habilitado');
    } else {
      logger.warn('📱 Serviço Telegram desabilitado');
    }
  }

  /**
   * Envia mensagem para o Telegram
   */
  async sendMessage(text, options = {}) {
    if (!this.enabled) {
      logger.debug('Notificação Telegram ignorada (desabilitado)');
      return { success: true, skipped: true };
    }

    try {
      const payload = {
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options
      };

      const response = await this.client.post('/sendMessage', payload);
      
      logger.info('✅ Mensagem enviada ao Telegram', {
        messageId: response.data.result.message_id
      });

      return {
        success: true,
        messageId: response.data.result.message_id
      };
      
    } catch (error) {
      logger.error('❌ Erro ao enviar mensagem Telegram', {
        error: error.message,
        response: error.response?.data
      });

      // Não propagar erro do Telegram para não interromper o monitor
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Envia alerta de erro
   */
  async sendErrorAlert(errorMessage, context = {}) {
    const message = this.formatMessage(errorMessage, 'error', context);
    return await this.sendMessage(message);
  }

  /**
   * Envia notificação de recuperação
   */
  async sendRecoveryAlert(message, context = {}) {
    const formattedMessage = this.formatMessage(message, 'recovery', context);
    return await this.sendMessage(formattedMessage);
  }

  /**
   * Envia relatório diário
   */
  async sendDailyReport(stats) {
    const message = this.formatDailyReport(stats);
    return await this.sendMessage(message);
  }

  /**
   * Formata mensagem com contexto adicional
   */
  formatMessage(message, type = 'info', context = {}) {
    let formatted = message;

    // Adicionar rodapé com informações do sistema
    formatted += '\n\n---\n';
    formatted += `🖥️ **Monitor PIX For4**\n`;
    formatted += `🌍 **Ambiente:** ${config.system.env}\n`;
    
    if (context.version) {
      formatted += `📦 **Versão:** ${context.version}\n`;
    }

    return formatted;
  }

  /**
   * Formata relatório diário
   */
  formatDailyReport(stats) {
    const { date, checks, errors, uptime, avgResponseTime, totalCost } = stats;
    
    let message = `📊 **RELATÓRIO DIÁRIO - Sistema PIX For4**\n\n`;
    message += `📅 **Data:** ${date}\n\n`;
    
    message += `**📈 Estatísticas:**\n`;
    message += `• Total de verificações: ${checks.total}\n`;
    message += `• Verificações com sucesso: ${checks.success} ✅\n`;
    message += `• Verificações com erro: ${checks.failed} ❌\n`;
    message += `• Uptime: ${uptime}%\n`;
    message += `• Tempo médio de resposta: ${avgResponseTime}ms\n\n`;
    
    if (errors.length > 0) {
      message += `**❌ Erros Detectados:**\n`;
      errors.forEach(error => {
        message += `• ${error.time} - ${error.type}: ${error.message}\n`;
      });
      message += '\n';
    }
    
    message += `**💰 Custo do Monitoramento:**\n`;
    message += `• Transações realizadas: ${checks.total}\n`;
    message += `• Valor por transação: R$ 5,00\n`;
    message += `• Custo total do dia: R$ ${totalCost.toFixed(2)}\n`;
    
    return message;
  }

  /**
   * Testa a conexão com o Telegram
   */
  async testConnection() {
    try {
      const response = await this.client.get('/getMe');
      const botInfo = response.data.result;
      
      logger.info('✅ Conexão com Telegram estabelecida', {
        botName: botInfo.username,
        botId: botInfo.id
      });

      // Enviar mensagem de teste
      await this.sendMessage(
        '🤖 **Monitor PIX For4 - Teste de Conexão**\n\n' +
        '✅ Bot conectado com sucesso!\n' +
        `🤖 Nome do bot: @${botInfo.username}\n` +
        `🆔 ID do bot: ${botInfo.id}\n\n` +
        'O monitoramento está pronto para iniciar.'
      );

      return {
        success: true,
        botInfo
      };
      
    } catch (error) {
      logger.error('❌ Erro ao conectar com Telegram', {
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Envia botões inline para ações rápidas
   */
  async sendMessageWithButtons(text, buttons) {
    if (!this.enabled) {
      return { success: true, skipped: true };
    }

    try {
      const payload = {
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons
        }
      };

      const response = await this.client.post('/sendMessage', payload);
      return {
        success: true,
        messageId: response.data.result.message_id
      };
      
    } catch (error) {
      logger.error('Erro ao enviar mensagem com botões', {
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Formata e envia status resumido
   */
  async sendStatusSummary(status) {
    let message = '📊 **STATUS DO MONITOR PIX**\n\n';
    
    if (status.isHealthy) {
      message += '✅ Sistema funcionando normalmente\n\n';
    } else {
      message += '❌ Sistema com problemas\n\n';
    }
    
    message += `⏰ Última verificação: ${status.lastCheck}\n`;
    message += `📈 Verificações hoje: ${status.checksToday}\n`;
    message += `💰 Custo hoje: R$ ${status.costToday.toFixed(2)}\n`;
    
    if (status.lastError) {
      message += `\n⚠️ Último erro: ${status.lastError.time}\n`;
      message += `Tipo: ${status.lastError.type}\n`;
    }
    
    const buttons = [
      [
        { text: '🔄 Forçar Verificação', callback_data: 'force_check' },
        { text: '📊 Relatório Completo', callback_data: 'full_report' }
      ],
      [
        { text: '⏸️ Pausar Monitor', callback_data: 'pause_monitor' },
        { text: '📈 Ver Logs', callback_data: 'view_logs' }
      ]
    ];
    
    return await this.sendMessageWithButtons(message, buttons);
  }
}

module.exports = new TelegramService();