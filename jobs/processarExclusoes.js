// api-backend/jobs/processarExclusoes.js

const cron = require('node-cron');
const supabase = require('../utils/supabaseClient');
const { enviarEmail } = require('../utils/notificationService');

// ============================================
// FUNÇÃO PRINCIPAL: Processar Exclusões
// ============================================
async function processarExclusoesAgendadas() {
  console.log('🗑️ [CRON] Processando exclusões agendadas...');

  try {
    // Buscar exclusões prontas para executar
    const { data: exclusoes, error } = await supabase
      .from('exclusoes_pendentes')
      .select('*')
      .eq('pronto_para_excluir', true)
      .eq('status', 'aguardando');

    if (error) throw error;

    if (!exclusoes || exclusoes.length === 0) {
      console.log('✅ [CRON] Nenhuma exclusão pendente');
      return;
    }

    console.log(`📊 [CRON] ${exclusoes.length} exclusão(ões) para processar`);

    for (const exclusao of exclusoes) {
      try {
        await executarExclusao(exclusao);
      } catch (err) {
        console.error(`❌ [CRON] Erro ao processar exclusão ${exclusao.id}:`, err);
      }
    }

    console.log('✅ [CRON] Processamento de exclusões concluído!');
  } catch (error) {
    console.error('❌ [CRON] Erro ao processar exclusões:', error);
  }
}

// ============================================
// EXECUTAR EXCLUSÃO DE CONTA
// ============================================
async function executarExclusao(exclusao) {
  console.log(`🗑️ Executando exclusão: ${exclusao.nome_usuario} (${exclusao.tipo_usuario})`);

  const { usuario_id, tipo_usuario, email_usuario, nome_usuario } = exclusao;

  try {
    // 1. Buscar dados do usuário
    const { data: usuario, error: userError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', usuario_id)
      .single();

    if (userError || !usuario) {
      console.warn(`⚠️ Usuário ${usuario_id} não encontrado (já pode ter sido excluído)`);
      await marcarComoExecutado(exclusao.id, null);
      return;
    }

    // 2. Criar backup mínimo (sem dados sensíveis)
    const backup = {
      id: usuario_id,
      tipo: tipo_usuario,
      data_criacao: usuario.created_at,
      data_exclusao: new Date().toISOString()
    };

    // 3. Anonimizar dados relacionados
    if (tipo_usuario === 'lojista') {
      await anonimizarDadosLojista(usuario_id);
    } else if (tipo_usuario === 'consultor') {
      await anonimizarDadosConsultor(usuario_id);
    }

    // 5. Excluir do banco de dados
    const { error: deleteError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', usuario_id);

    if (deleteError) throw deleteError;

    // 6. Registrar exclusão realizada
    await supabase
      .from('exclusoes_realizadas')
      .insert({
        usuario_id,
        tipo_usuario,
        email_usuario,
        nome_usuario,
        motivo: exclusao.motivo,
        data_exclusao: new Date().toISOString(),
        dados_backup: backup,
        executado_por: 'sistema'
      });

    // 7. Marcar agendamento como executado
    await marcarComoExecutado(exclusao.id, usuario_id);

    // 8. Enviar email de confirmação
    await enviarEmail(
      email_usuario,
      '✅ Conta Excluída - Compra Smart',
      emailTemplateExclusaoConcluida(nome_usuario, tipo_usuario)
    );

    // 9. Registrar notificação
    await supabase
      .from('notificacoes_exclusao')
      .insert({
        exclusao_agendada_id: exclusao.id,
        tipo_notificacao: 'execucao',
        email_destinatario: email_usuario,
        status: 'enviado'
      });

    console.log(`✅ Exclusão concluída: ${nome_usuario}`);

  } catch (error) {
    console.error(`❌ Erro ao executar exclusão:`, error);
    throw error;
  }
}

// ============================================
// ANONIMIZAR DADOS DO LOJISTA
// ============================================
async function anonimizarDadosLojista(lojistaId) {
  console.log(`🔒 Anonimizando dados do lojista ${lojistaId}`);

  try {
    // Anonimizar produtos (manter histórico mas remover referência)
    await supabase
      .from('produtos')
      .update({
        lojista_id: null,
        nome: '[Produto de loja excluída]',
        descricao: '[Dados removidos]'
      })
      .eq('lojista_id', lojistaId);

    // Anonimizar vendas
    await supabase
      .from('vendas')
      .update({
        id_lojista: null
      })
      .eq('id_lojista', lojistaId);

    // Deletar mensagens de chat
    await supabase
      .from('auditoria_chats')
      .delete()
      .or(`usuario1_id.eq.${lojistaId},usuario2_id.eq.${lojistaId}`);

    // Anonimizar comissões (manter registro financeiro mas sem identificação)
    await supabase
      .from('comissoes')
      .update({
        lojista_id: null
      })
      .eq('lojista_id', lojistaId);

    console.log(`✅ Dados do lojista ${lojistaId} anonimizados`);
  } catch (error) {
    console.error('❌ Erro ao anonimizar dados do lojista:', error);
    throw error;
  }
}

// ============================================
// ANONIMIZAR DADOS DO CONSULTOR
// ============================================
// ============================================
// ANONIMIZAR E BLOQUEAR CPF DO CONSULTOR
// ============================================
async function anonimizarDadosConsultor(consultorId) {
  console.log(`🔒 Anonimizando dados do consultor ${consultorId}`);

  try {
    // 1. Buscar CPF antes de excluir
    const { data: consultor, error: consultorError } = await supabase
      .from('usuarios')
      .select('cpf, email')
      .eq('id', consultorId)
      .single();

    if (consultorError) throw consultorError;

    // 2. Bloquear CPF para impedir novo cadastro
    if (consultor.cpf) {
      await supabase
        .from('cpfs_bloqueados')
        .insert({
          cpf: consultor.cpf,
          tipo_usuario: 'consultor',
          motivo: 'conta_excluida',
          observacoes: `Conta excluída. Email anterior: ${consultor.email}`,
          data_bloqueio: new Date().toISOString()
        });
      
      console.log(`🚫 CPF ${consultor.cpf} bloqueado permanentemente`);
    }

    // 3. Anonimizar avaliações (manter histórico mas sem identificação)
    await supabase
      .from('avaliacoes')
      .update({
        consultor_id: null,
        comentario: '[Consultor removido da plataforma]'
      })
      .eq('consultor_id', consultorId);

    // 4. Anonimizar comissões (manter registro financeiro mas sem identificação)
    await supabase
      .from('comissoes')
      .update({
        consultor_id: null
      })
      .eq('consultor_id', consultorId);

    // 5. Deletar mensagens de chat (LGPD)
    await supabase
      .from('auditoria_chats')
      .delete()
      .or(`usuario1_id.eq.${consultorId},usuario2_id.eq.${consultorId}`);

    // 6. Anonimizar vendas (manter histórico mas sem identificação)
    await supabase
      .from('vendas')
      .update({
        consultor_id: null
      })
      .eq('consultor_id', consultorId);

    console.log(`✅ Dados do consultor ${consultorId} anonimizados`);
  } catch (error) {
    console.error('❌ Erro ao anonimizar dados do consultor:', error);
    throw error;
  }
}

// ============================================
// MARCAR AGENDAMENTO COMO EXECUTADO
// ============================================
async function marcarComoExecutado(agendamentoId, usuarioId) {
  await supabase
    .from('exclusoes_agendadas')
    .update({
      status: 'executado',
      updated_at: new Date().toISOString()
    })
    .eq('id', agendamentoId);
}

// ============================================
// ENVIAR LEMBRETES PERIÓDICOS
// ============================================
async function enviarLembretes() {
  console.log('📧 [CRON] Enviando lembretes de exclusão...');

  try {
    const { data: exclusoes, error } = await supabase
      .from('exclusoes_agendadas')
      .select('*')
      .eq('status', 'aguardando');

    if (error) throw error;

    const hoje = new Date();

    for (const exclusao of exclusoes) {
      const diasRestantes = Math.ceil(
        (new Date(exclusao.data_exclusao_prevista) - hoje) / (1000 * 60 * 60 * 24)
      );

      let tipoLembrete = null;

      if (diasRestantes === 7) tipoLembrete = 'lembrete_7dias';
      else if (diasRestantes === 15) tipoLembrete = 'lembrete_15dias';
      else if (diasRestantes === 1) tipoLembrete = 'lembrete_29dias';

      if (tipoLembrete) {
        // Verificar se já enviou esse tipo de lembrete
        const { data: jaEnviado } = await supabase
          .from('notificacoes_exclusao')
          .select('id')
          .eq('exclusao_agendada_id', exclusao.id)
          .eq('tipo_notificacao', tipoLembrete)
          .single();

        if (!jaEnviado) {
          await enviarEmail(
            exclusao.email_usuario,
            `⏰ Lembrete: Exclusão em ${diasRestantes} dia(s) - Compra Smart`,
            emailTemplateLembrete(exclusao.nome_usuario, diasRestantes, exclusao.data_exclusao_prevista)
          );

          await supabase
            .from('notificacoes_exclusao')
            .insert({
              exclusao_agendada_id: exclusao.id,
              tipo_notificacao: tipoLembrete,
              email_destinatario: exclusao.email_usuario,
              status: 'enviado'
            });

          console.log(`📧 Lembrete ${tipoLembrete} enviado para ${exclusao.email_usuario}`);
        }
      }
    }

    console.log('✅ [CRON] Lembretes processados');
  } catch (error) {
    console.error('❌ [CRON] Erro ao enviar lembretes:', error);
  }
}

// ============================================
// TEMPLATES DE EMAIL
// ============================================

function emailTemplateExclusaoConcluida(nome, tipo) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #333; color: white; padding: 20px; text-align: center;">
        <h1>✅ Conta Excluída</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <p>Olá <strong>${nome}</strong>,</p>
        <p>Sua conta foi <strong>permanentemente excluída</strong> conforme solicitado.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>✅ Ações realizadas:</h3>
          <ul>
            <li>Conta removida do sistema</li>
            <li>Dados pessoais excluídos</li>
            <li>Histórico anonimizado (LGPD)</li>
            ${tipo === 'lojista' ? '<li>Período de retenção de 30 dias cumprido</li>' : '<li>Exclusão imediata executada</li>'}
          </ul>
        </div>

        <p>Agradecemos por ter feito parte da Compra Smart! 💙</p>
        <p>Caso tenha alguma dúvida, estamos à disposição.</p>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `;
}

function emailTemplateLembrete(nome, diasRestantes, dataExclusao) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #f39c12; color: white; padding: 20px; text-align: center;">
        <h1>⏰ Lembrete de Exclusão</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <p>Olá <strong>${nome}</strong>,</p>
        <p>Este é um lembrete sobre a exclusão da sua conta.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f39c12;">
          <h3>📅 Faltam apenas ${diasRestantes} dia(s)</h3>
          <p><strong>Data da exclusão:</strong> ${new Date(dataExclusao).toLocaleDateString('pt-BR')}</p>
        </div>

        <h3>🔄 Ainda dá tempo de cancelar!</h3>
        <p>Se você mudou de ideia, pode cancelar a exclusão clicando no botão abaixo:</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://suacomprasmart.com.br/cancelar-exclusao" 
             style="background: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            CANCELAR EXCLUSÃO
          </a>
        </div>

        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          Após a data prevista, todos os dados serão permanentemente excluídos.
        </p>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `;
}

// ============================================
// INICIAR CRON JOBS
// ============================================
function iniciarCronExclusoes() {
  // Processar exclusões todo dia às 3h da manhã
  cron.schedule('0 3 * * *', async () => {
    console.log('\n🗑️ ========== CRON: PROCESSAR EXCLUSÕES ==========');
    await processarExclusoesAgendadas();
    console.log('====================================================\n');
  });

  // Enviar lembretes todo dia às 10h da manhã
  cron.schedule('0 10 * * *', async () => {
    console.log('\n📧 ========== CRON: ENVIAR LEMBRETES ==========');
    await enviarLembretes();
    console.log('================================================\n');
  });

  console.log('✅ Cron jobs de exclusão iniciados:');
  console.log('   🗑️  Processar exclusões: 3h da manhã');
  console.log('   📧 Enviar lembretes: 10h da manhã');
}

module.exports = { 
  iniciarCronExclusoes,
  processarExclusoesAgendadas,
  enviarLembretes
};