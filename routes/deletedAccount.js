// api-backend/routes/deleteAccount.js

const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const { blockUserInAuth0, deleteUserInAuth0 } = require('../utils/auth0Management');
const { enviarEmail } = require('../utils/notificationService');

// ========================================
// SOLICITAR EXCLUSÃO DE CONTA (LOJISTA)
// ========================================
router.post('/lojista/solicitar', async (req, res) => {
  const { lojista_id, motivo } = req.body;

  try {
    // Buscar dados do lojista
    const { data: lojista, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', lojista_id)
      .eq('tipo', 'lojista')
      .single();

    if (error || !lojista) {
      return res.status(404).json({ error: 'Lojista não encontrado' });
    }

    // Data de exclusão: 30 dias a partir de agora
    const dataExclusao = new Date();
    dataExclusao.setDate(dataExclusao.getDate() + 30);

    // Criar registro de exclusão agendada
    const { data: agendamento, error: agendError } = await supabase
      .from('exclusoes_agendadas')
      .insert({
        usuario_id: lojista_id,
        tipo_usuario: 'lojista',
        motivo: motivo || 'Solicitado pelo usuário',
        data_solicitacao: new Date().toISOString(),
        data_exclusao_prevista: dataExclusao.toISOString(),
        status: 'aguardando',
        email_usuario: lojista.email,
        nome_usuario: lojista.nome
      })
      .select()
      .single();

    if (agendError) throw agendError;

    // Bloquear acesso imediatamente
    await supabase
      .from('usuarios')
      .update({ 
        ativo: false,
        motivo_bloqueio: 'Exclusão solicitada - Aguardando 30 dias',
        data_bloqueio: new Date().toISOString()
      })
      .eq('id', lojista_id);

    // Bloquear no Auth0
    if (lojista.auth0_id) {
      await blockUserInAuth0(lojista.auth0_id, 'Exclusão solicitada');
    }

    // Enviar email de confirmação
    await enviarEmail(
      lojista.email,
      '🗑️ Solicitação de Exclusão de Conta - Compra Smart',
      emailTemplateExclusaoLojista(lojista.nome, dataExclusao)
    );

    res.json({
      success: true,
      message: 'Exclusão agendada com sucesso',
      data_exclusao: dataExclusao,
      agendamento_id: agendamento.id
    });

  } catch (error) {
    console.error('Erro ao agendar exclusão:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// CANCELAR EXCLUSÃO (LOJISTA)
// ========================================
router.post('/lojista/cancelar', async (req, res) => {
  const { lojista_id } = req.body;

  try {
    // Buscar agendamento
    const { data: agendamento, error } = await supabase
      .from('exclusoes_agendadas')
      .select('*')
      .eq('usuario_id', lojista_id)
      .eq('status', 'aguardando')
      .single();

    if (error || !agendamento) {
      return res.status(404).json({ error: 'Nenhuma exclusão agendada encontrada' });
    }

    // Cancelar agendamento
    await supabase
      .from('exclusoes_agendadas')
      .update({
        status: 'cancelado',
        data_cancelamento: new Date().toISOString()
      })
      .eq('id', agendamento.id);

    // Desbloquear conta
    await supabase
      .from('usuarios')
      .update({
        ativo: true,
        motivo_bloqueio: null,
        data_bloqueio: null
      })
      .eq('id', lojista_id);

    // Desbloquear no Auth0
    const { data: lojista } = await supabase
      .from('usuarios')
      .select('auth0_id, email, nome')
      .eq('id', lojista_id)
      .single();

    if (lojista?.auth0_id) {
      await unblockUserInAuth0(lojista.auth0_id);
    }

    // Enviar email
    await enviarEmail(
      agendamento.email_usuario,
      '✅ Exclusão Cancelada - Compra Smart',
      emailTemplateCancelamento(agendamento.nome_usuario)
    );

    res.json({
      success: true,
      message: 'Exclusão cancelada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao cancelar exclusão:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// EXCLUIR CONTA IMEDIATAMENTE (CONSULTOR)
// ========================================
// ========================================
// EXCLUIR CONTA IMEDIATAMENTE (CONSULTOR)
// ========================================
router.post('/consultor/excluir', async (req, res) => {
  const { consultor_id, senha } = req.body;

  try {
    // Buscar consultor
    const { data: consultor, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', consultor_id)
      .eq('tipo', 'consultor')
      .single();

    if (error || !consultor) {
      return res.status(404).json({ error: 'Consultor não encontrado' });
    }

    // TODO: Validar senha (implementar depois se necessário)

    // 1. Bloquear CPF ANTES de excluir
    if (consultor.cpf) {
      await supabase
        .from('cpfs_bloqueados')
        .insert({
          cpf: consultor.cpf,
          tipo_usuario: 'consultor',
          motivo: 'conta_excluida',
          observacoes: `Exclusão voluntária. Email: ${consultor.email}`,
          data_bloqueio: new Date().toISOString()
        });
    }

    // 2. Registrar exclusão (antes de anonimizar)
    await supabase
      .from('exclusoes_realizadas')
      .insert({
        usuario_id: consultor_id,
        tipo_usuario: 'consultor',
        email_usuario: consultor.email,
        nome_usuario: consultor.nome,
        data_exclusao: new Date().toISOString(),
        motivo: 'Solicitado pelo usuário',
        dados_backup: {
          cpf_bloqueado: consultor.cpf,
          data_criacao: consultor.created_at
        }
      });

    // 3. Anonimizar dados relacionados
    await anonimizarDadosConsultor(consultor_id);

    // 4. Excluir do Auth0
    if (consultor.auth0_id) {
      await deleteUserInAuth0(consultor.auth0_id);
    }

    // 5. Excluir do banco
    await supabase
      .from('usuarios')
      .delete()
      .eq('id', consultor_id);

    // 6. Enviar email de confirmação
    await enviarEmail(
      consultor.email,
      '✅ Conta Excluída - Compra Smart',
      emailTemplateExclusaoConsultor(consultor.nome)
    );

    res.json({
      success: true,
      message: 'Conta excluída com sucesso',
      cpf_bloqueado: !!consultor.cpf
    });

  } catch (error) {
    console.error('Erro ao excluir consultor:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

async function anonimizarDadosConsultor(consultorId) {
  try {
    // Anonimizar avaliações
    await supabase
      .from('avaliacoes')
      .update({
        consultor_id: null,
        comentario: '[Usuário excluído]'
      })
      .eq('consultor_id', consultorId);

    // Anonimizar comissões
    await supabase
      .from('comissoes')
      .update({
        consultor_id: null
      })
      .eq('consultor_id', consultorId);

    // Deletar mensagens
    await supabase
      .from('auditoria_chats')
      .delete()
      .or(`usuario1_id.eq.${consultorId},usuario2_id.eq.${consultorId}`);

    console.log(`✅ Dados do consultor ${consultorId} anonimizados`);
  } catch (error) {
    console.error('Erro ao anonimizar dados:', error);
  }
}

// ========================================
// VERIFICAR SE CPF ESTÁ BLOQUEADO
// ========================================
router.get('/verificar-cpf/:cpf', async (req, res) => {
  const { cpf } = req.params;

  try {
    const { data, error } = await supabase
      .from('cpfs_bloqueados')
      .select('*')
      .eq('cpf', cpf)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    if (data) {
      return res.json({
        bloqueado: true,
        motivo: data.motivo,
        data_bloqueio: data.data_bloqueio,
        mensagem: 'Este CPF não pode ser usado para criar nova conta'
      });
    }

    res.json({ bloqueado: false });

  } catch (error) {
    console.error('Erro ao verificar CPF:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// TEMPLATES DE EMAIL
// ========================================

function emailTemplateExclusaoLojista(nome, dataExclusao) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
        <h1>🗑️ Solicitação de Exclusão de Conta</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <p>Olá <strong>${nome}</strong>,</p>
        <p>Recebemos sua solicitação de exclusão de conta.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">
          <h3>📅 Período de Retenção: 30 dias</h3>
          <p><strong>Data prevista de exclusão:</strong> ${new Date(dataExclusao).toLocaleDateString('pt-BR')}</p>
        </div>

        <h3>⚠️ O que acontece agora:</h3>
        <ul>
          <li>Seu acesso foi <strong>bloqueado imediatamente</strong></li>
          <li>Você tem <strong>30 dias para fazer backup</strong> dos seus dados</li>
          <li>Após 30 dias, todos os dados serão <strong>permanentemente excluídos</strong></li>
        </ul>

        <h3>🔄 Mudou de ideia?</h3>
        <p>Você pode <strong>cancelar a exclusão</strong> a qualquer momento nos próximos 30 dias.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://suacomprasmart.com.br/cancelar-exclusao" 
             style="background: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            CANCELAR EXCLUSÃO
          </a>
        </div>

        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          Se você não solicitou esta exclusão, entre em contato imediatamente.
        </p>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `;
}

function emailTemplateCancelamento(nome) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #2ecc71; color: white; padding: 20px; text-align: center;">
        <h1>✅ Exclusão Cancelada!</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <p>Olá <strong>${nome}</strong>,</p>
        <p>Sua solicitação de exclusão foi <strong>cancelada com sucesso</strong>!</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p>✅ Sua conta foi reativada</p>
          <p>✅ Todos os seus dados foram preservados</p>
          <p>✅ Você já pode acessar normalmente</p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="https://suacomprasmart.com.br/login" 
             style="background: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            ACESSAR MINHA CONTA
          </a>
        </div>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `;
}

function emailTemplateExclusaoConsultor(nome) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #333; color: white; padding: 20px; text-align: center;">
        <h1>👋 Conta Excluída</h1>
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
            <li><strong>CPF bloqueado</strong> para novos cadastros</li>
          </ul>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;">
            <strong>⚠️ Importante:</strong> Seu CPF foi bloqueado e não poderá ser usado para criar uma nova conta na plataforma.
          </p>
        </div>

        <p>Agradecemos por ter feito parte da Compra Smart! 💙</p>
        <p>Se tiver dúvidas, entre em contato através do suporte.</p>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `;
}

module.exports = router;