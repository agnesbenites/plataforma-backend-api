// api-backend/routes/webhooks.js

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('../utils/supabaseClient');
const { notificarContaSuspensa } = require('../utils/notificationService');

// Webhook do Stripe (RAW BODY NECESSÁRIO!)
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      // Verificar assinatura do webhook
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`✅ Webhook recebido: ${event.type}`);

    // ============================================
    // PROCESSAR EVENTOS DO STRIPE
    // ============================================

    try {
      switch (event.type) {
        // Pagamento bem-sucedido
        case 'payment_intent.succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;

        // Pagamento falhou
        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        // Assinatura criada
        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object);
          break;

        // Assinatura atualizada
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;

        // Assinatura cancelada
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        // Fatura paga
        case 'invoice.paid':
          await handleInvoicePaid(event.data.object);
          break;

        // Fatura não paga
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object);
          break;

        default:
          console.log(`⚠️ Evento não tratado: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// HANDLERS DOS EVENTOS
// ============================================

async function handlePaymentSucceeded(paymentIntent) {
  console.log('✅ Pagamento bem-sucedido:', paymentIntent.id);

  const { customer } = paymentIntent;

  // Desbloquear usuário se estava bloqueado
  const { data: lojista } = await supabase
    .from('usuarios')
    .select('*')
    .eq('stripe_customer_id', customer)
    .single();

  if (lojista && lojista.ativo === false) {
    await supabase
      .from('usuarios')
      .update({
        ativo: true,
        data_ultimo_pagamento: new Date().toISOString(),
        tentativas_cobranca: 0,
      })
      .eq('id', lojista.id);

    console.log(`✅ Lojista ${lojista.nome} desbloqueado!`);
  }
}

async function handlePaymentFailed(paymentIntent) {
  console.log('❌ Pagamento falhou:', paymentIntent.id);

  const { customer } = paymentIntent;

  const { data: lojista } = await supabase
    .from('usuarios')
    .select('*')
    .eq('stripe_customer_id', customer)
    .single();

  if (lojista) {
    const novasTentativas = (lojista.tentativas_cobranca || 0) + 1;

    await supabase
      .from('usuarios')
      .update({
        tentativas_cobranca: novasTentativas,
      })
      .eq('id', lojista.id);

    // Bloquear após 3 tentativas
    if (novasTentativas >= 3) {
      await supabase
        .from('usuarios')
        .update({ ativo: false })
        .eq('id', lojista.id);

      await notificarContaSuspensa(lojista);
      console.log(`❌ Lojista ${lojista.nome} bloqueado após 3 tentativas!`);
    }
  }
}

async function handleSubscriptionCreated(subscription) {
  console.log('✅ Assinatura criada:', subscription.id);
  // Lógica adicional se necessário
}

async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 Assinatura atualizada:', subscription.id);
  // Atualizar plano no banco se necessário
}

async function handleSubscriptionDeleted(subscription) {
  console.log('❌ Assinatura cancelada:', subscription.id);
  
  const { customer } = subscription;

  await supabase
    .from('usuarios')
    .update({ ativo: false })
    .eq('stripe_customer_id', customer);
}

async function handleInvoicePaid(invoice) {
  console.log('✅ Fatura paga:', invoice.id);
}

async function handleInvoicePaymentFailed(invoice) {
  console.log('❌ Falha no pagamento da fatura:', invoice.id);
}

module.exports = router;