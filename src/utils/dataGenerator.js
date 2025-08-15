const moment = require('moment');

/**
 * Gera CPF válido para testes
 */
function generateValidCPF() {
  const randomDigits = () => Math.floor(Math.random() * 9);
  
  // Gera 9 dígitos aleatórios
  const digits = Array.from({ length: 9 }, randomDigits);
  
  // Calcula primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  const firstVerifier = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  digits.push(firstVerifier);
  
  // Calcula segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  const secondVerifier = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  digits.push(secondVerifier);
  
  return digits.join('');
}

/**
 * Gera dados únicos para cada transação de teste
 */
function generateTestData() {
  const timestamp = Date.now();
  const dateStr = moment().format('YYYYMMDD-HHmmss');
  
  return {
    customer: {
      name: `Monitor PIX ${dateStr}`,
      email: `monitor-${timestamp}@for4test.com`,
      cpf: generateValidCPF(),
      phone: `169${Math.floor(Math.random() * 90000000 + 10000000)}` // Gera número válido
    },
    externalId: `HEALTH-CHECK-${timestamp}`,
    metadata: {
      type: 'health_check',
      timestamp: timestamp,
      date: moment().toISOString()
    }
  };
}

/**
 * Valida se o horário atual está dentro do período de monitoramento
 */
function isWithinMonitoringHours(startHour, endHour) {
  if (!startHour || !endHour) return true;
  
  const now = moment();
  const currentHour = now.hour();
  
  // Se o horário final é menor que inicial, assumimos que passa pela meia-noite
  if (endHour < startHour) {
    return currentHour >= startHour || currentHour < endHour;
  }
  
  return currentHour >= startHour && currentHour < endHour;
}

/**
 * Formata valores em centavos para Real
 */
function formatCurrency(cents) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Gera um ID único para rastreamento
 */
function generateTrackingId() {
  return `TRK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

module.exports = {
  generateValidCPF,
  generateTestData,
  isWithinMonitoringHours,
  formatCurrency,
  generateTrackingId
};