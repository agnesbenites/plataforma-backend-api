// api-backend/routes/stripeConnect.routes.js

const express = require('express');
const router = express.Router();
const {
  createConnectAccount,
  createOnboardingLink,
  checkAccountStatus,
  updateAccountStatusInDB,
  createDashboardLink,
} = require('../utils/stripeConnect');
const supabase = require('../utils/supabaseClient');

/**
 * 1️⃣ APROVAR CONSULTOR E CRIAR CONTA CONNECT
 * POST /api/stripe-connect/approve-consultor
 * Body: { consultorId }
 */
router.post('/approve-consultor', async (req, res) => {
  try {
    const { consultorId } = req.body;

    if (!consultorId) {
      return res.status(400).json({
        success: false,
        error: 'consultorId é obrigatório',
      });
    }

    console.log(`📋 Aprovando consultor: ${consultorId}`);

    // 1. Buscar dados do consultor
    const { data: consultor, error: consultorError } = await supabase
      .from('consultores')
      .select('*')
      .eq('id', consultorId)
      .single();

    if (consultorError || !consultor) {
      return res.status(404).json({
        success: false,
        error: 'Consultor não encontrado',
      });
    }

    // 2. Verificar se já tem conta Stripe
    if (consultor.stripe_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Consultor já possui conta Stripe Connect',
        accountId: consultor.stripe_account_id,
      });
    }

    // 3. Criar conta Connect no Stripe
    const accountResult = await createConnectAccount(consultorId, consultor.email);

    if (!accountResult.success) {
      return res.status(500).json(accountResult);
    }

    // 4. Gerar link de onboarding
    const linkResult = await createOnboardingLink(
      accountResult.accountId,
      `${process.env.FRONTEND_URL}/consultor/onboarding/success`,
      `${process.env.FRONTEND_URL}/consultor/onboarding/refresh`
    );

    if (!linkResult.success) {
      return res.status(500).json(linkResult);
    }

    // 5. Aprovar consultor no banco
    const { error: updateError } = await supabase
      .from('consultores')
      .update({
        aprovado: true,
        stripe_account_status: 'pending',
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', consultorId);

    if (updateError) {
      console.error('❌ Erro ao aprovar consultor:', updateError);
    }

    console.log(`✅ Consultor aprovado e conta Connect criada!`);

    return res.status(200).json({
      success: true,
      message: 'Consultor aprovado! Conta Connect criada.',
      accountId: accountResult.accountId,
      onboardingUrl: linkResult.url,
      expiresAt: linkResult.expiresAt,
    });

  } catch (error) {
    console.error('❌ Erro ao aprovar consultor:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 2️⃣ GERAR NOVO LINK DE ONBOARDING
 * POST /api/stripe-connect/generate-onboarding-link
 * Body: { consultorId }
 */
router.post('/generate-onboarding-link', async (req, res) => {
  try {
    const { consultorId } = req.body;

    if (!consultorId) {
      return res.status(400).json({
        success: false,
        error: 'consultorId é obrigatório',
      });
    }

    // Buscar stripe_account_id
    const { data: consultor, error } = await supabase
      .from('consultores')
      .select('stripe_account_id, nome')
      .eq('id', consultorId)
      .single();

    if (error || !consultor || !consultor.stripe_account_id) {
      return res.status(404).json({
        success: false,
        error: 'Consultor não possui conta Stripe Connect',
      });
    }

    // Gerar novo link
    const linkResult = await createOnboardingLink(
      consultor.stripe_account_id,
      `${process.env.FRONTEND_URL}/consultor/onboarding/success`,
      `${process.env.FRONTEND_URL}/consultor/onboarding/refresh`
    );

    if (!linkResult.success) {
      return res.status(500).json(linkResult);
    }

    return res.status(200).json({
      success: true,
      onboardingUrl: linkResult.url,
      expiresAt: linkResult.expiresAt,
    });

  } catch (error) {
    console.error('❌ Erro ao gerar link:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 3️⃣ VERIFICAR STATUS DA CONTA
 * GET /api/stripe-connect/account-status/:consultorId
 */
router.get('/account-status/:consultorId', async (req, res) => {
  try {
    const { consultorId } = req.params;

    // Buscar stripe_account_id
    const { data: consultor, error } = await supabase
      .from('consultores')
      .select('stripe_account_id, stripe_account_status')
      .eq('id', consultorId)
      .single();

    if (error || !consultor || !consultor.stripe_account_id) {
      return res.status(404).json({
        success: false,
        error: 'Consultor não possui conta Stripe Connect',
      });
    }

    // Verificar status no Stripe
    const statusResult = await checkAccountStatus(consultor.stripe_account_id);

    if (!statusResult.success) {
      return res.status(500).json(statusResult);
    }

    // Atualizar no banco de dados
    await updateAccountStatusInDB(consultorId, consultor.stripe_account_id);

    return res.status(200).json({
      success: true,
      accountId: statusResult.accountId,
      isActive: statusResult.isActive,
      chargesEnabled: statusResult.chargesEnabled,
      payoutsEnabled: statusResult.payoutsEnabled,
      requiresAction: statusResult.requiresAction,
      pendingRequirements: statusResult.pendingRequirements,
      status: statusResult.status,
    });

  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 4️⃣ GERAR LINK DO DASHBOARD STRIPE
 * GET /api/stripe-connect/dashboard-link/:consultorId
 */
router.get('/dashboard-link/:consultorId', async (req, res) => {
  try {
    const { consultorId } = req.params;

    // Buscar stripe_account_id
    const { data: consultor, error } = await supabase
      .from('consultores')
      .select('stripe_account_id')
      .eq('id', consultorId)
      .single();

    if (error || !consultor || !consultor.stripe_account_id) {
      return res.status(404).json({
        success: false,
        error: 'Consultor não possui conta Stripe Connect',
      });
    }

    // Gerar link do dashboard
    const linkResult = await createDashboardLink(consultor.stripe_account_id);

    if (!linkResult.success) {
      return res.status(500).json(linkResult);
    }

    return res.status(200).json({
      success: true,
      dashboardUrl: linkResult.url,
    });

  } catch (error) {
    console.error('❌ Erro ao gerar link do dashboard:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 5️⃣ WEBHOOK: ATUALIZAR STATUS QUANDO CONSULTOR COMPLETAR ONBOARDING
 * POST /api/stripe-connect/webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Processar evento
  if (event.type === 'account.updated') {
    const account = event.data.object;

    console.log(`📩 Webhook: Conta atualizada - ${account.id}`);

    // Buscar consultor por stripe_account_id
    const { data: consultor, error } = await supabase
      .from('consultores')
      .select('id')
      .eq('stripe_account_id', account.id)
      .single();

    if (consultor) {
      await updateAccountStatusInDB(consultor.id, account.id);
    }
  }

  res.json({ received: true });
});

module.exports = router;