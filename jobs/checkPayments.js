// api-backend/jobs/checkPayments.js

const cron = require('node-cron');
const supabase = require('../utils/supabaseClient');
const {
  notificarInadimplenciaDia1,
  notificarInadimplenciaDia3,
  notificarContaSuspensa,
} = require('../utils/notificationService');

// ============================================
// CRON JOB: Roda todo dia às 8h da manhã
// ============================================
function iniciarVerificacaoDePagamentos() {
  // Cron: "0 8 * * *" = Todo dia às 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('🔍 [CRON] Verificando inadimplência...');

    try {
      // Buscar lojistas ativos
      const { data: lojistas, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('tipo', 'lojista')
        .eq('ativo', true);

      if (error) throw error;

      const hoje = new Date();

      for (const lojista of lojistas) {
        const dataUltimoPagamento = new Date(lojista.data_ultimo_pagamento);
        const diasAtraso = Math.floor(
          (hoje - dataUltimoPagamento) / (1000 * 60 * 60 * 24)
        );

        console.log(`📊 Lojista ${lojista.nome}: ${diasAtraso} dias de atraso`);

        // Dia 1: Primeira notificação
        if (diasAtraso === 1) {
          console.log('📧 Enviando notificação dia 1...');
          await notificarInadimplenciaDia1(lojista);
        }

        // Dia 3: Alerta de suspensão iminente
        if (diasAtraso === 3) {
          console.log('🚨 Enviando notificação dia 3...');
          await notificarInadimplenciaDia3(lojista);
        }

        // Dia 4: Suspender conta
        if (diasAtraso >= 4) {
          console.log('❌ Suspendendo conta...');
          
          await supabase
            .from('usuarios')
            .update({ ativo: false })
            .eq('id', lojista.id);

          await notificarContaSuspensa(lojista);
        }
      }

      console.log('✅ [CRON] Verificação concluída!');
    } catch (error) {
      console.error('❌ [CRON] Erro ao verificar inadimplência:', error);
    }
  });

  console.log('✅ Cron job de verificação de pagamentos iniciado!');
  console.log('⏰ Roda todo dia às 8:00 AM');
}

module.exports = { iniciarVerificacaoDePagamentos };