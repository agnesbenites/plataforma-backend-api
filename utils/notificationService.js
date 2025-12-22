// api-backend/utils/notificationService.js

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const supabase = require('./supabaseClient');

// ============================================
// CONFIGURAÇÃO DE EMAIL (Nodemailer)
// ============================================
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ============================================
// CONFIGURAÇÃO DE SMS/PUSH (Twilio)
// ============================================
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// ============================================
// FUNÇÕES DE NOTIFICAÇÃO
// ============================================

/**
 * Enviar email
 */
async function enviarEmail(destinatario, assunto, corpo) {
  try {
    const info = await emailTransporter.sendMail({
      from: `"Compra Smart" <${process.env.SMTP_USER}>`,
      to: destinatario,
      subject: assunto,
      html: corpo,
    });

    console.log('✅ Email enviado:', info.messageId);
    
    // Salvar no banco para histórico
    await supabase.from('notificacoes_enviadas').insert({
      tipo: 'email',
      destinatario,
      assunto,
      status: 'enviado',
      enviado_em: new Date().toISOString(),
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Erro ao enviar email:', error);
    
    await supabase.from('notificacoes_enviadas').insert({
      tipo: 'email',
      destinatario,
      assunto,
      status: 'falhou',
      erro: error.message,
      enviado_em: new Date().toISOString(),
    });

    return { success: false, error: error.message };
  }
}

/**
 * Enviar SMS
 */
async function enviarSMS(telefone, mensagem) {
  if (!twilioClient) {
    console.warn('⚠️ Twilio não configurado');
    return { success: false, error: 'Twilio não configurado' };
  }

  try {
    const message = await twilioClient.messages.create({
      body: mensagem,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: telefone,
    });

    console.log('✅ SMS enviado:', message.sid);
    
    await supabase.from('notificacoes_enviadas').insert({
      tipo: 'sms',
      destinatario: telefone,
      mensagem,
      status: 'enviado',
      enviado_em: new Date().toISOString(),
    });

    return { success: true, sid: message.sid };
  } catch (error) {
    console.error('❌ Erro ao enviar SMS:', error);
    
    await supabase.from('notificacoes_enviadas').insert({
      tipo: 'sms',
      destinatario: telefone,
      mensagem,
      status: 'falhou',
      erro: error.message,
      enviado_em: new Date().toISOString(),
    });

    return { success: false, error: error.message };
  }
}

/**
 * Enviar Push Notification (via Supabase Realtime ou Expo)
 */
async function enviarPush(usuarioId, titulo, corpo, dados = {}) {
  try {
    // Buscar token push do usuário
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('push_token')
      .eq('id', usuarioId)
      .single();

    if (error || !usuario?.push_token) {
      console.warn('⚠️ Push token não encontrado para usuário:', usuarioId);
      return { success: false, error: 'Push token não encontrado' };
    }

    // Enviar via Expo Push Notifications
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: usuario.push_token,
        title: titulo,
        body: corpo,
        data: dados,
        sound: 'default',
        priority: 'high',
      }),
    });

    const result = await response.json();
    
    console.log('✅ Push notification enviado:', result);
    
    await supabase.from('notificacoes_enviadas').insert({
      tipo: 'push',
      destinatario: usuarioId,
      titulo,
      mensagem: corpo,
      status: 'enviado',
      enviado_em: new Date().toISOString(),
    });

    return { success: true, result };
  } catch (error) {
    console.error('❌ Erro ao enviar push:', error);
    
    await supabase.from('notificacoes_enviadas').insert({
      tipo: 'push',
      destinatario: usuarioId,
      titulo,
      mensagem: corpo,
      status: 'falhou',
      erro: error.message,
      enviado_em: new Date().toISOString(),
    });

    return { success: false, error: error.message };
  }
}

// ============================================
// TEMPLATES DE EMAIL
// ============================================

const emailTemplates = {
  inadimplencia_dia1: (nomeLojista, valorDevido, dataVencimento) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #2c5aa0; color: white; padding: 20px; text-align: center;">
        <h1>⚠️ Pagamento Pendente</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <p>Olá <strong>${nomeLojista}</strong>,</p>
        <p>Identificamos que o pagamento da sua assinatura está <strong>1 dia em atraso</strong>.</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Valor:</strong> R$ ${valorDevido.toFixed(2)}</p>
          <p><strong>Vencimento:</strong> ${new Date(dataVencimento).toLocaleDateString('pt-BR')}</p>
        </div>
        <p>Por favor, regularize o pagamento o quanto antes para continuar usando a plataforma.</p>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Caso já tenha realizado o pagamento, desconsidere este email.
        </p>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `,

  inadimplencia_dia3: (nomeLojista, valorDevido) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
        <h1>🚨 ATENÇÃO: Suspensão Iminente</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <p>Olá <strong>${nomeLojista}</strong>,</p>
        <p style="color: #e74c3c; font-weight: bold;">
          Sua conta será suspensa em 24 horas caso o pagamento não seja realizado!
        </p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">
          <p><strong>Valor pendente:</strong> R$ ${valorDevido.toFixed(2)}</p>
          <p><strong>⚠️ Prazo final:</strong> Até amanhã às 23:59</p>
        </div>
        <p>Após a suspensão:</p>
        <ul>
          <li>Seus consultores serão realocados</li>
          <li>Clientes serão redirecionados</li>
          <li>Acesso ao dashboard será bloqueado</li>
        </ul>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://suacomprasmart.com.br/pagamento" 
             style="background: #e74c3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            PAGAR AGORA
          </a>
        </div>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `,

  conta_suspensa: (nomeLojista) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #333; color: white; padding: 20px; text-align: center;">
        <h1>❌ Conta Suspensa</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <p>Olá <strong>${nomeLojista}</strong>,</p>
        <p>Sua conta foi <strong>suspensa por inadimplência</strong>.</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p>Para reativar sua conta:</p>
          <ol>
            <li>Realize o pagamento pendente</li>
            <li>Aguarde até 2 horas para reativação automática</li>
            <li>Taxa de reativação: R$ 50,00</li>
          </ol>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://suacomprasmart.com.br/reativar" 
             style="background: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            REATIVAR CONTA
          </a>
        </div>
      </div>
      <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        Compra Smart © 2024 | suacomprasmart.com.br
      </div>
    </div>
  `,
};

// ============================================
// FUNÇÕES ESPECÍFICAS DE NOTIFICAÇÃO
// ============================================

async function notificarInadimplenciaDia1(lojista) {
  const { nome, email, telefone, id } = lojista;
  const { valor_devido, data_vencimento } = lojista;

  // Email
  await enviarEmail(
    email,
    '⚠️ Pagamento Pendente - Compra Smart',
    emailTemplates.inadimplencia_dia1(nome, valor_devido, data_vencimento)
  );

  // Push
  await enviarPush(
    id,
    '⚠️ Pagamento Pendente',
    'Seu pagamento está 1 dia em atraso. Por favor, regularize.'
  );

  // SMS (opcional)
  if (telefone) {
    await enviarSMS(
      telefone,
      `Compra Smart: Pagamento pendente de R$ ${valor_devido.toFixed(2)}. Regularize em: suacomprasmart.com.br`
    );
  }
}

async function notificarInadimplenciaDia3(lojista) {
  const { nome, email, telefone, id, valor_devido } = lojista;

  await enviarEmail(
    email,
    '🚨 URGENTE: Conta será suspensa em 24h',
    emailTemplates.inadimplencia_dia3(nome, valor_devido)
  );

  await enviarPush(
    id,
    '🚨 Conta será suspensa amanhã',
    'Pague agora para evitar suspensão!'
  );

  if (telefone) {
    await enviarSMS(
      telefone,
      `URGENTE: Sua conta Compra Smart será suspensa amanhã! Pague: suacomprasmart.com.br`
    );
  }
}

async function notificarContaSuspensa(lojista) {
  const { nome, email, id } = lojista;

  await enviarEmail(
    email,
    '❌ Conta Suspensa - Compra Smart',
    emailTemplates.conta_suspensa(nome)
  );

  await enviarPush(
    id,
    '❌ Conta Suspensa',
    'Sua conta foi suspensa. Clique para reativar.'
  );
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  enviarEmail,
  enviarSMS,
  enviarPush,
  notificarInadimplenciaDia1,
  notificarInadimplenciaDia3,
  notificarContaSuspensa,
};