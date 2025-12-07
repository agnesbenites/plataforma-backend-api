// api-backend/jobs/scoreRecalculationJob.js

const cron = require('node-cron');
const ScoreService = require('../services/scoreService');

/**
 * Cronjob para recalcular scores diariamente às 03:00 AM
 */
function iniciarJobRecalculoScore() {
  // Executar todos os dias às 03:00
  cron.schedule('0 3 * * *', async () => {
    console.log('🕐 [03:00] Iniciando recálculo automático de scores...');
    
    const inicio = Date.now();
    
    try {
      const resultado = await ScoreService.recalcularTodos();
      
      const tempoDecorrido = ((Date.now() - inicio) / 1000).toFixed(2);
      
      console.log(`✅ Recálculo concluído em ${tempoDecorrido}s`);
      console.log(`   ├─ Sucessos: ${resultado.sucesso}`);
      console.log(`   └─ Erros: ${resultado.erros}`);
      
    } catch (error) {
      console.error('❌ Erro no cronjob de recálculo de scores:', error);
    }
  }, {
    timezone: "America/Sao_Paulo"
  });
  
  console.log('⏰ Cronjob de recálculo de scores configurado (03:00 AM)');
}

module.exports = { iniciarJobRecalculoScore };