// api-backend/utils/stripeConnect.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('./supabaseClient');

/**
 * 1️⃣ CRIAR CONTA CONNECT PARA CONSULTOR
 * Cria uma conta Stripe Express para o consultor receber transferências
 */
async function createConnectAccount(consultorId, email) {
  try {
    console.log(`🔄 Criando conta Connect para consultor: ${consultorId}`);

    // Cria a conta Connect no Stripe
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'BR',
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
    });

    console.log(`✅ Conta Connect criada! ID: ${account.id}`);

    // Salva o ID da conta no Supabase
    const { error } = await supabase
      .from('consultores')
      .update({ 
        stripe_account_id: account.id,
        stripe_account_status: 'pending'
      })
      .eq('id', consultorId);

    if (error) {
      console.error('❌ Erro ao salvar no Supabase:', error);
      throw error;
    }

    return {
      success: true,
      accountId: account.id,
      message: 'Conta Connect criada com sucesso!'
    };

  } catch (error) {
    console.error('❌ Erro ao criar conta Connect:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 2️⃣ GERAR LINK DE ONBOARDING
 * Cria o link para o consultor completar o cadastro no Stripe
 */
async function createOnboardingLink(stripeAccountId, returnUrl, refreshUrl) {
  try {
    console.log(`🔄 Gerando link de onboarding para conta: ${stripeAccountId}`);

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl || `${process.env.FRONTEND_URL}/consultor/onboarding/refresh`,
      return_url: returnUrl || `${process.env.FRONTEND_URL}/consultor/onboarding/success`,
      type: 'account_onboarding',
    });

    console.log(`✅ Link gerado: ${accountLink.url}`);

    return {
      success: true,
      url: accountLink.url,
      expiresAt: accountLink.expires_at
    };

  } catch (error) {
    console.error('❌ Erro ao gerar link de onboarding:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 3️⃣ VERIFICAR STATUS DA CONTA
 * Checa se a conta Connect está ativa e pode receber transferências
 */
async function checkAccountStatus(stripeAccountId) {
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);

    const isActive = account.charges_enabled && account.payouts_enabled;
    const requiresAction = account.requirements?.currently_due?.length > 0;

    return {
      success: true,
      accountId: account.id,
      isActive: isActive,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requiresAction: requiresAction,
      pendingRequirements: account.requirements?.currently_due || [],
      status: isActive ? 'active' : 'restricted'
    };

  } catch (error) {
    console.error('❌ Erro ao verificar status da conta:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 4️⃣ ATUALIZAR STATUS NO SUPABASE
 * Sincroniza o status da conta Connect com o banco de dados
 */
async function updateAccountStatusInDB(consultorId, stripeAccountId) {
  try {
    const statusCheck = await checkAccountStatus(stripeAccountId);

    if (!statusCheck.success) {
      throw new Error('Erro ao verificar status da conta');
    }

    const { error } = await supabase
      .from('consultores')
      .update({ 
        stripe_account_status: statusCheck.status,
        stripe_charges_enabled: statusCheck.chargesEnabled,
        stripe_payouts_enabled: statusCheck.payoutsEnabled,
        updated_at: new Date().toISOString()
      })
      .eq('id', consultorId);

    if (error) throw error;

    return {
      success: true,
      status: statusCheck.status,
      message: 'Status atualizado no banco de dados!'
    };

  } catch (error) {
    console.error('❌ Erro ao atualizar status no DB:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 5️⃣ GERAR LINK DO DASHBOARD
 * Cria link para o consultor acessar seu painel no Stripe
 */
async function createDashboardLink(stripeAccountId) {
  try {
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);

    return {
      success: true,
      url: loginLink.url
    };

  } catch (error) {
    console.error('❌ Erro ao criar link do dashboard:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 6️⃣ DELETAR CONTA CONNECT (ADMIN)
 * Remove a conta Connect do Stripe (usar com cuidado!)
 */
async function deleteConnectAccount(stripeAccountId) {
  try {
    await stripe.accounts.del(stripeAccountId);

    return {
      success: true,
      message: 'Conta Connect deletada com sucesso!'
    };

  } catch (error) {
    console.error('❌ Erro ao deletar conta:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 7️⃣ LISTAR TODAS AS CONTAS CONNECT (ADMIN)
 * Retorna lista de todas as contas Connect cadastradas
 */
async function listAllConnectAccounts() {
  try {
    const accounts = await stripe.accounts.list({ limit: 100 });

    return {
      success: true,
      accounts: accounts.data
    };

  } catch (error) {
    console.error('❌ Erro ao listar contas:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 📤 EXPORTAR TODAS AS FUNÇÕES
module.exports = {
  createConnectAccount,
  createOnboardingLink,
  checkAccountStatus,
  updateAccountStatusInDB,
  createDashboardLink,
  deleteConnectAccount,
  listAllConnectAccounts
};