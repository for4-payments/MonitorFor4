const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');
const { generateTestData, formatCurrency } = require('../utils/dataGenerator');

class For4Service {
  constructor() {
    this.client = axios.create({
      baseURL: config.for4.apiUrl,
      timeout: config.monitor.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.for4.secretKey
      }
    });

    // Interceptor para log de requisições
    this.client.interceptors.request.use(
      (request) => {
        logger.debug('🔄 Requisição For4', {
          method: request.method.toUpperCase(),
          url: request.url,
          headers: { ...request.headers, Authorization: '[REDACTED]' }
        });
        request.metadata = { startTime: Date.now() };
        return request;
      },
      (error) => {
        logger.error('Erro no interceptor de requisição', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Interceptor para log de respostas
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        logger.debug('✅ Resposta For4', {
          status: response.status,
          duration: `${duration}ms`,
          url: response.config.url
        });
        response.responseTime = duration;
        return response;
      },
      (error) => {
        if (error.config?.metadata?.startTime) {
          const duration = Date.now() - error.config.metadata.startTime;
          error.responseTime = duration;
        }
        
        logger.error('❌ Erro na resposta For4', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
          url: error.config?.url
        });
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Cria uma transação PIX de teste
   */
  async createPixTransaction(trackingId) {
    try {
      const testData = generateTestData();
      
      const payload = {
        name: testData.customer.name,
        email: testData.customer.email,
        cpf: testData.customer.cpf,
        phone: testData.customer.phone,
        paymentMethod: 'PIX',
        amount: config.testTransaction.amount,
        traceable: true,
        externalId: testData.externalId,
        items: [config.testTransaction.item],
        postbackUrl: process.env.WEBHOOK_URL || null
      };

      logger.info('📤 Criando transação PIX de teste', {
        trackingId,
        amount: formatCurrency(payload.amount),
        customer: payload.email
      });

      const response = await this.client.post(config.for4.endpoints.purchase, payload);
      
      // Validar resposta
      this.validatePixResponse(response.data);
      console.log('resposta : ' + response.data)
      return {
        success: true,
        data: response.data,
        responseTime: response.responseTime,
        testData
      };
      
    } catch (error) {
      logger.error('Erro ao criar transação PIX', {
        trackingId,
        error: error.message,
        response: error.response?.data
      });
      
      throw {
        ...error,
        trackingId,
        isFor4Error: true
      };
    }
  }

  /**
   * Valida se a resposta do PIX está correta
   */
  validatePixResponse(data) {
    const requiredFields = ['id', 'status', 'pixCode', 'pixQrCode'];
    const missingFields = [];
    
    for (const field of requiredFields) {
      if (!data[field]) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      const error = new Error(`Campos obrigatórios faltando na resposta: ${missingFields.join(', ')}`);
      error.type = 'INVALID_RESPONSE';
      error.missingFields = missingFields;
      
      // Caso especial: transação criada mas sem código PIX
      if (!data.pixCode || !data.pixQrCode) {
        error.type = 'NO_PIX_CODE';
        error.message = 'Transação criada mas sem código PIX';
      }
      
      throw error;
    }
    
    // Validar status
    if (data.status !== 'PENDING') {
      logger.warn('⚠️ Status inesperado para transação PIX', {
        expected: 'PENDING',
        received: data.status
      });
    }
  }

  /**
   * Busca detalhes de uma transação
   */
  async getTransactionDetails(transactionId) {
    try {
      const response = await this.client.get(config.for4.endpoints.getPayment, {
        params: { id: transactionId }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Erro ao buscar detalhes da transação', {
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verifica a saúde da API
   */
  async healthCheck() {
    try {
      // Tenta criar uma transação PIX mínima
      const trackingId = `HEALTH-${Date.now()}`;
      const result = await this.createPixTransaction(trackingId);
      
      return {
        healthy: true,
        responseTime: result.responseTime,
        pixCode: result.data.pixCode,
        pixQrCode: result.data.pixQrCode,
        transactionId: result.data.id,
        amount: result.data.amount,
        status: result.data.status
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        errorType: error.type || 'UNKNOWN',
        responseTime: error.responseTime || null
      };
    }
  }

  /**
   * Formata dados da transação para log/notificação
   */
  formatTransactionSummary(transaction) {
    return {
      id: transaction.id,
      status: transaction.status,
      amount: formatCurrency(transaction.amount),
      pixCode: transaction.pixCode ? '✓ Gerado' : '✗ Não gerado',
      pixQrCode: transaction.pixQrCode ? '✓ Gerado' : '✗ Não gerado',
      createdAt: transaction.createdAt,
      expiresAt: transaction.expiresAt
    };
  }
}

module.exports = new For4Service();