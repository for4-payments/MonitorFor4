const fs = require('fs').promises;
const path = require('path');
const moment = require('moment-timezone');
const config = require('../config/config');

class PerformanceTracker {
  constructor() {
    this.metrics = {
      current: {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        samples: []
      },
      hourly: {},
      daily: {},
      lastUpdate: null
    };
    
    this.metricsFile = path.join(config.paths.data, 'performance-metrics.json');
    this.maxSamples = 1000; // Manter últimas 1000 amostras
    this.loadMetrics();
  }

  /**
   * Carrega métricas salvas
   */
  async loadMetrics() {
    try {
      const data = await fs.readFile(this.metricsFile, 'utf8');
      this.metrics = JSON.parse(data);
    } catch (error) {
      // Arquivo não existe, usar métricas padrão
    }
  }

  /**
   * Salva métricas
   */
  async saveMetrics() {
    try {
      await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.error('Erro ao salvar métricas:', error);
    }
  }

  /**
   * Registra um tempo de resposta
   */
  async recordResponseTime(responseTime, success = true, hasPixCode = true) {
    const now = moment();
    const hour = now.format('YYYY-MM-DD-HH');
    const day = now.format('YYYY-MM-DD');
    
    // Atualizar métricas atuais
    this.metrics.current.count++;
    this.metrics.current.totalTime += responseTime;
    this.metrics.current.minTime = Math.min(this.metrics.current.minTime, responseTime);
    this.metrics.current.maxTime = Math.max(this.metrics.current.maxTime, responseTime);
    
    // Adicionar amostra
    const sample = {
      time: now.toISOString(),
      responseTime,
      success,
      hasPixCode
    };
    
    this.metrics.current.samples.push(sample);
    
    // Limitar amostras
    if (this.metrics.current.samples.length > this.maxSamples) {
      this.metrics.current.samples = this.metrics.current.samples.slice(-this.maxSamples);
    }
    
    // Atualizar métricas por hora
    if (!this.metrics.hourly[hour]) {
      this.metrics.hourly[hour] = {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        failures: 0
      };
    }
    
    this.metrics.hourly[hour].count++;
    this.metrics.hourly[hour].totalTime += responseTime;
    this.metrics.hourly[hour].minTime = Math.min(this.metrics.hourly[hour].minTime, responseTime);
    this.metrics.hourly[hour].maxTime = Math.max(this.metrics.hourly[hour].maxTime, responseTime);
    if (!success) this.metrics.hourly[hour].failures++;
    
    // Atualizar métricas diárias
    if (!this.metrics.daily[day]) {
      this.metrics.daily[day] = {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        failures: 0,
        hourlyBreakdown: {}
      };
    }
    
    this.metrics.daily[day].count++;
    this.metrics.daily[day].totalTime += responseTime;
    this.metrics.daily[day].minTime = Math.min(this.metrics.daily[day].minTime, responseTime);
    this.metrics.daily[day].maxTime = Math.max(this.metrics.daily[day].maxTime, responseTime);
    if (!success) this.metrics.daily[day].failures++;
    
    // Breakdown por hora do dia
    const hourOfDay = now.format('HH');
    if (!this.metrics.daily[day].hourlyBreakdown[hourOfDay]) {
      this.metrics.daily[day].hourlyBreakdown[hourOfDay] = {
        count: 0,
        totalTime: 0,
        avgTime: 0
      };
    }
    
    const hourBreakdown = this.metrics.daily[day].hourlyBreakdown[hourOfDay];
    hourBreakdown.count++;
    hourBreakdown.totalTime += responseTime;
    hourBreakdown.avgTime = Math.round(hourBreakdown.totalTime / hourBreakdown.count);
    
    // Atualizar timestamp
    this.metrics.lastUpdate = now.toISOString();
    
    // Limpar dados antigos (manter últimos 7 dias)
    this.cleanOldData();
    
    // Salvar
    await this.saveMetrics();
  }

  /**
   * Limpa dados antigos
   */
  cleanOldData() {
    const sevenDaysAgo = moment().subtract(7, 'days');
    
    // Limpar métricas horárias
    Object.keys(this.metrics.hourly).forEach(hour => {
      if (moment(hour, 'YYYY-MM-DD-HH').isBefore(sevenDaysAgo)) {
        delete this.metrics.hourly[hour];
      }
    });
    
    // Limpar métricas diárias
    Object.keys(this.metrics.daily).forEach(day => {
      if (moment(day, 'YYYY-MM-DD').isBefore(sevenDaysAgo)) {
        delete this.metrics.daily[day];
      }
    });
  }

  /**
   * Obtém estatísticas atuais
   */
  getCurrentStats() {
    const { current } = this.metrics;
    
    if (current.count === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        last10: []
      };
    }
    
    return {
      count: current.count,
      average: Math.round(current.totalTime / current.count),
      min: current.minTime === Infinity ? 0 : current.minTime,
      max: current.maxTime,
      last10: current.samples.slice(-10).map(s => ({
        time: moment(s.time).format('HH:mm:ss'),
        responseTime: s.responseTime,
        success: s.success
      }))
    };
  }

  /**
   * Obtém estatísticas das últimas horas
   */
  getHourlyStats(hours = 24) {
    const stats = [];
    const now = moment();
    
    for (let i = hours - 1; i >= 0; i--) {
      const hour = now.clone().subtract(i, 'hours');
      const hourKey = hour.format('YYYY-MM-DD-HH');
      const hourData = this.metrics.hourly[hourKey];
      
      if (hourData) {
        stats.push({
          hour: hour.format('HH:00'),
          date: hour.format('DD/MM'),
          count: hourData.count,
          average: Math.round(hourData.totalTime / hourData.count),
          min: hourData.minTime === Infinity ? 0 : hourData.minTime,
          max: hourData.maxTime,
          failures: hourData.failures
        });
      } else {
        stats.push({
          hour: hour.format('HH:00'),
          date: hour.format('DD/MM'),
          count: 0,
          average: 0,
          min: 0,
          max: 0,
          failures: 0
        });
      }
    }
    
    return stats;
  }

  /**
   * Obtém análise de performance
   */
  getPerformanceAnalysis() {
    const last24h = this.getHourlyStats(24);
    const currentStats = this.getCurrentStats();
    
    // Calcular tendência
    const recentAvg = this.calculateRecentAverage(6); // Últimas 6 horas
    const olderAvg = this.calculateRecentAverage(24, 6); // 24-6 horas atrás
    
    let trend = 'estável';
    let trendEmoji = '➡️';
    let trendPercent = 0;
    
    if (recentAvg > 0 && olderAvg > 0) {
      trendPercent = ((recentAvg - olderAvg) / olderAvg) * 100;
      
      if (trendPercent > 10) {
        trend = 'piorando';
        trendEmoji = '📈';
      } else if (trendPercent < -10) {
        trend = 'melhorando';
        trendEmoji = '📉';
      }
    }
    
    // Identificar horários críticos
    const criticalHours = last24h
      .filter(h => h.average > currentStats.average * 1.5 && h.count > 0)
      .map(h => `${h.hour} (${h.average}ms)`)
      .slice(0, 3);
    
    // Calcular percentis
    const sortedSamples = this.metrics.current.samples
      .map(s => s.responseTime)
      .sort((a, b) => a - b);
    
    const p50 = this.calculatePercentile(sortedSamples, 50);
    const p95 = this.calculatePercentile(sortedSamples, 95);
    const p99 = this.calculatePercentile(sortedSamples, 99);
    
    return {
      trend,
      trendEmoji,
      trendPercent: Math.abs(trendPercent).toFixed(1),
      criticalHours,
      percentiles: { p50, p95, p99 },
      totalRequests: currentStats.count,
      avgResponseTime: currentStats.average,
      bestTime: currentStats.min,
      worstTime: currentStats.max
    };
  }

  /**
   * Calcula média recente
   */
  calculateRecentAverage(hours, offset = 0) {
    const now = moment();
    let totalTime = 0;
    let totalCount = 0;
    
    for (let i = offset; i < offset + hours; i++) {
      const hour = now.clone().subtract(i, 'hours');
      const hourKey = hour.format('YYYY-MM-DD-HH');
      const hourData = this.metrics.hourly[hourKey];
      
      if (hourData && hourData.count > 0) {
        totalTime += hourData.totalTime;
        totalCount += hourData.count;
      }
    }
    
    return totalCount > 0 ? totalTime / totalCount : 0;
  }

  /**
   * Calcula percentil
   */
  calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Gera gráfico ASCII de performance
   */
  generateASCIIChart(hours = 12) {
    const stats = this.getHourlyStats(hours);
    const maxValue = Math.max(...stats.map(s => s.average));
    const chartHeight = 10;
    
    if (maxValue === 0) return 'Sem dados suficientes para gerar gráfico';
    
    let chart = '📊 Tempo de Resposta (ms) - Últimas ' + hours + ' horas\n\n';
    
    // Gerar linhas do gráfico
    for (let i = chartHeight; i > 0; i--) {
      const threshold = (maxValue / chartHeight) * i;
      let line = String(Math.round(threshold)).padStart(5) + ' |';
      
      stats.forEach(stat => {
        if (stat.count === 0) {
          line += '  ';
        } else if (stat.average >= threshold) {
          line += '█ ';
        } else if (stat.average >= threshold - (maxValue / chartHeight / 2)) {
          line += '▄ ';
        } else {
          line += '  ';
        }
      });
      
      chart += line + '\n';
    }
    
    // Linha base
    chart += '     +' + '─'.repeat(stats.length * 2) + '\n';
    chart += '      ';
    
    // Labels de hora
    stats.forEach((stat, index) => {
      if (index % Math.ceil(hours / 12) === 0) {
        chart += stat.hour.substring(0, 2);
      } else {
        chart += '  ';
      }
    });
    
    return chart;
  }

  /**
   * Formata relatório de performance
   */
  formatPerformanceReport() {
    const analysis = this.getPerformanceAnalysis();
    const stats = this.getCurrentStats();
    
    let report = `⚡ **RELATÓRIO DE PERFORMANCE PIX**\n\n`;
    report += `📊 **Estatísticas Gerais**\n`;
    report += `• Total de requisições: ${analysis.totalRequests}\n`;
    report += `• Tempo médio: ${analysis.avgResponseTime}ms\n`;
    report += `• Melhor tempo: ${analysis.bestTime}ms\n`;
    report += `• Pior tempo: ${analysis.worstTime}ms\n\n`;
    
    report += `📈 **Análise de Tendência**\n`;
    report += `• Tendência: ${analysis.trendEmoji} ${analysis.trend} (${analysis.trendPercent}%)\n\n`;
    
    report += `🎯 **Percentis**\n`;
    report += `• P50 (mediana): ${analysis.percentiles.p50}ms\n`;
    report += `• P95: ${analysis.percentiles.p95}ms\n`;
    report += `• P99: ${analysis.percentiles.p99}ms\n\n`;
    
    if (analysis.criticalHours.length > 0) {
      report += `⚠️ **Horários Críticos**\n`;
      analysis.criticalHours.forEach(hour => {
        report += `• ${hour}\n`;
      });
      report += '\n';
    }
    
    report += `🕐 **Últimas 10 Verificações**\n`;
    stats.last10.forEach(sample => {
      const emoji = sample.success ? '✅' : '❌';
      report += `• ${sample.time}: ${sample.responseTime}ms ${emoji}\n`;
    });
    
    return report;
  }
}

module.exports = new PerformanceTracker();