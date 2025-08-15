const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const logger = require('./logger');

// Tipos de erro conhecidos
const ErrorTypes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  API_ERROR: 'API_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NO_PIX_CODE: 'NO_PIX_CODE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// Arquivo para armazenar estado de erros
const errorStateFile = path.join(config.paths.data, 'error-state.json');

class ErrorHandler {
  constructor() {
    this.errorState = {};
    this.loadErrorState();
  }

  /**
   * Carrega o estado de erros do arquivo
   */
  async loadErrorState() {
    try {
      const data = await fs.readFile(errorStateFile, 'utf8');
      this.errorState = JSON.parse(data);
    } catch (error) {
      // Arquivo não existe ou erro ao ler, inicializar vazio
      this.errorState = {};
    }
  }

  /**
   * Salva o estado de erros no arquivo
   */
  async saveErrorState() {
    try {
      // Criar diretório se não existir
      const dataDir = path.dirname(errorStateFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      await fs.writeFile(errorStateFile, JSON.stringify(this.errorState, null, 2));
    } catch (error) {
      logger.error('Erro ao salvar estado de erros', { error: error.message });
    }
  }

  /**
   * Classifica o tipo de erro baseado na resposta
   */
  classifyError(error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return ErrorTypes.TIMEOUT_ERROR;
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return ErrorTypes.NETWORK_ERROR;
    }
    
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401 || status === 403) {
        return ErrorTypes.AUTH_ERROR;
      }
      
      if (status >= 400 && status < 500) {
        return ErrorTypes.API_ERROR;
      }
      
      if (status >= 500) {
        return ErrorTypes.API_ERROR;
      }
    }
    
    return ErrorTypes.UNKNOWN_ERROR;
  }

  /**
   * Formata mensagem de erro para notificação
   */
  formatErrorMessage(error, context) {
    const errorType = this.classifyError(error);
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    let message = `🚨 **ALERTA - Sistema PIX For4**\n\n`;
    message += `⏰ **Horário:** ${timestamp}\n`;
    message += `❌ **Tipo de Erro:** ${this.getErrorTypeDescription(errorType)}\n`;
    message += `🔍 **ID de Rastreamento:** ${context.trackingId || 'N/A'}\n\n`;
    
    // Detalhes específicos por tipo de erro
    switch (errorType) {
      case ErrorTypes.TIMEOUT_ERROR:
        message += `⏱️ **Detalhes:** A API não respondeu em ${config.monitor.requestTimeout / 1000} segundos\n`;
        break;
        
      case ErrorTypes.NETWORK_ERROR:
        message += `🌐 **Detalhes:** Não foi possível conectar à API\n`;
        message += `📡 **Código:** ${error.code || 'N/A'}\n`;
        break;
        
      case ErrorTypes.AUTH_ERROR:
        message += `🔐 **Detalhes:** Erro de autenticação - Verifique a secret key\n`;
        message += `📊 **Status HTTP:** ${error.response?.status || 'N/A'}\n`;
        break;
        
      case ErrorTypes.API_ERROR:
        message += `🖥️ **Detalhes:** Erro retornado pela API\n`;
        message += `📊 **Status HTTP:** ${error.response?.status || 'N/A'}\n`;
        if (error.response?.data?.message) {
          message += `💬 **Mensagem:** ${error.response.data.message}\n`;
        }
        break;
        
      case ErrorTypes.NO_PIX_CODE:
        message += `📱 **Detalhes:** Transação criada mas sem código PIX\n`;
        break;
        
      default:
        message += `❓ **Detalhes:** ${error.message}\n`;
    }
    
    // Adicionar informações de recuperação
    if (this.errorState[errorType]) {
      const errorCount = this.errorState[errorType].count || 1;
      const firstOccurrence = new Date(this.errorState[errorType].firstOccurrence);
      
      message += `\n📈 **Estatísticas:**\n`;
      message += `• Ocorrências consecutivas: ${errorCount}\n`;
      message += `• Primeira ocorrência: ${firstOccurrence.toLocaleString('pt-BR')}\n`;
    }
    
    message += `\n🔧 **Ação Recomendada:** ${this.getRecommendedAction(errorType)}`;
    
    return message;
  }

  /**
   * Retorna descrição amigável do tipo de erro
   */
  getErrorTypeDescription(errorType) {
    const descriptions = {
      [ErrorTypes.NETWORK_ERROR]: 'Erro de Conexão',
      [ErrorTypes.TIMEOUT_ERROR]: 'Timeout - API não respondeu',
      [ErrorTypes.AUTH_ERROR]: 'Erro de Autenticação',
      [ErrorTypes.API_ERROR]: 'Erro da API',
      [ErrorTypes.INVALID_RESPONSE]: 'Resposta Inválida',
      [ErrorTypes.NO_PIX_CODE]: 'PIX sem Código',
      [ErrorTypes.UNKNOWN_ERROR]: 'Erro Desconhecido'
    };
    
    return descriptions[errorType] || 'Erro Não Classificado';
  }

  /**
   * Retorna ação recomendada para cada tipo de erro
   */
  getRecommendedAction(errorType) {
    const actions = {
      [ErrorTypes.NETWORK_ERROR]: 'Verificar conectividade de rede e status do servidor For4',
      [ErrorTypes.TIMEOUT_ERROR]: 'Verificar se a API está sobrecarregada ou com lentidão',
      [ErrorTypes.AUTH_ERROR]: 'Verificar se a secret key está correta e válida',
      [ErrorTypes.API_ERROR]: 'Verificar logs da API e entrar em contato com suporte For4',
      [ErrorTypes.INVALID_RESPONSE]: 'Verificar se houve mudança na API',
      [ErrorTypes.NO_PIX_CODE]: 'Verificar configuração do PIX na plataforma For4',
      [ErrorTypes.UNKNOWN_ERROR]: 'Verificar logs detalhados e investigar a causa'
    };
    
    return actions[errorType] || 'Verificar logs para mais detalhes';
  }

  /**
   * Registra um erro e verifica se deve notificar
   */
  async handleError(error, context) {
    const errorType = this.classifyError(error);
    const now = Date.now();
    
    // Inicializar estado do erro se não existir
    if (!this.errorState[errorType]) {
      this.errorState[errorType] = {
        count: 0,
        firstOccurrence: now,
        lastOccurrence: now,
        lastNotification: null
      };
    }
    
    // Atualizar contadores
    this.errorState[errorType].count++;
    this.errorState[errorType].lastOccurrence = now;
    
    // Verificar se deve notificar (respeitar cooldown)
    const shouldNotify = this.shouldSendNotification(errorType);
    
    if (shouldNotify) {
      this.errorState[errorType].lastNotification = now;
    }
    
    // Salvar estado
    await this.saveErrorState();
    
    // Retornar dados formatados
    return {
      type: errorType,
      message: this.formatErrorMessage(error, context),
      shouldNotify,
      errorCount: this.errorState[errorType].count
    };
  }

  /**
   * Verifica se deve enviar notificação baseado no cooldown
   */
  shouldSendNotification(errorType) {
    const state = this.errorState[errorType];
    if (!state || !state.lastNotification) {
      return true; // Primeira vez, sempre notifica
    }
    
    const cooldownMs = config.monitor.notificationCooldownMinutes * 60 * 1000;
    const timeSinceLastNotification = Date.now() - state.lastNotification;
    
    return timeSinceLastNotification >= cooldownMs;
  }

  /**
   * Limpa o estado de erro quando o sistema se recupera
   */
  async clearErrorState(errorType = null) {
    if (errorType) {
      delete this.errorState[errorType];
    } else {
      this.errorState = {};
    }
    
    await this.saveErrorState();
  }

  /**
   * Formata mensagem de recuperação
   */
  formatRecoveryMessage(context) {
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    let message = `✅ **RECUPERAÇÃO - Sistema PIX For4**\n\n`;
    message += `⏰ **Horário:** ${timestamp}\n`;
    message += `🎉 **Status:** Sistema funcionando normalmente\n`;
    message += `🔍 **ID de Rastreamento:** ${context.trackingId || 'N/A'}\n`;
    
    if (context.pixCode) {
      message += `📱 **PIX Code:** Gerado com sucesso\n`;
    }
    
    if (context.responseTime) {
      message += `⚡ **Tempo de Resposta:** ${context.responseTime}ms\n`;
    }
    
    message += `\n✨ O sistema voltou a operar normalmente!`;
    
    return message;
  }
}

module.exports = new ErrorHandler();