// backend/routes/stripeRoutes.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('../utils/supabaseClient');

// ============================================
// 1. CRIAR CONTA CONECTADA (Lojista/Consultor)
// ============================================
router.post('/criar-conta-conectada', async (req, res) => {
  try {
    const { email, tipo, nome, cpfCnpj, usuarioId } = req.body;

    // Criar conta conectada no Stripe
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'BR',
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      individual: {
        email: email,
        first_name: nome.split(' ')[0],
        last_name: nome.split(' ').slice(1).join(' ') || nome.split(' ')[0],
      },
      metadata: {
        tipo: tipo, // 'lojista' ou 'consultor'
        cpf_cnpj: cpfCnpj,
        usuario_id: usuarioId
      }
    });

    // Salvar stripe_account_id no Supabase
    const tabela = tipo === 'lojista' ? 'lojistas' : 'consultores';
    const { error: updateError } = await supabase
      .from(tabela)
      .update({ stripe_account_id: account.id })
      .eq('id', usuarioId);

    if (updateError) throw updateError;

    // Criar link de onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/reauth`,
      return_url: `${process.env.FRONTEND_URL}/cadastro-completo`,
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      accountId: account.id,
      onboardingUrl: accountLink.url
    });

  } catch (error) {
    console.error('Erro ao criar conta conectada:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 2. PROCESSAR PAGAMENTO COM SPLIT
// ============================================
router.post('/processar-pagamento', async (req, res) => {
  try {
    const { 
      produtoId, 
      lojistaStripeId, 
      consultorStripeId,
      lojistaId,
      consultorId,
      valorTotal, // em centavos
      percentualComissao,
      clienteEmail
    } = req.body;

    // Calcular valores
    const comissaoConsultor = Math.round((valorTotal * percentualComissao) / 100);
    const valorLojista = valorTotal - comissaoConsultor;

    // Criar Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: valorTotal,
      currency: 'brl',
      payment_method_types: ['card'],
      
      // Transferir para conta do lojista
      transfer_data: {
        destination: lojistaStripeId,
        amount: valorLojista
      },
      
      metadata: {
        produto_id: produtoId,
        lojista_id: lojistaId,
        consultor_id: consultorId,
        consultor_stripe_id: consultorStripeId,
        percentual_comissao: percentualComissao,
        comissao_valor: comissaoConsultor,
      },
      
      receipt_email: clienteEmail,
    });

    // Registrar venda no banco (status pendente)
    const { data: venda, error: vendaError } = await supabase
      .from('vendas')
      .insert([{
        produto_id: produtoId,
        lojista_id: lojistaId,
        consultor_id: consultorId,
        valor_total: valorTotal / 100,
        comissao_percentual: percentualComissao,
        comissao_valor: comissaoConsultor / 100,
        stripe_payment_intent_id: paymentIntent.id,
        status: 'pendente'
      }])
      .select()
      .single();

    if (vendaError) throw vendaError;

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      vendaId: venda.id,
      breakdown: {
        total: valorTotal / 100,
        lojista: valorLojista / 100,
        consultor: comissaoConsultor / 100
      }
    });

  } catch (error) {
    console.error('Erro ao processar pagamento:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 3. TRANSFERIR COMISSÃO PARA CONSULTOR
// ============================================
router.post('/transferir-comissao', async (req, res) => {
  try {
    const { consultorStripeId, valor, paymentIntentId } = req.body;

    const transfer = await stripe.transfers.create({
      amount: valor,
      currency: 'brl',
      destination: consultorStripeId,
      description: `Comissão - Payment Intent ${paymentIntentId}`,
      metadata: {
        payment_intent_id: paymentIntentId
      }
    });

    res.json({
      success: true,
      transferId: transfer.id,
      valor: valor / 100
    });

  } catch (error) {
    console.error('Erro ao transferir comissão:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 4. WEBHOOK - Confirmar Pagamento
// ============================================
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Erro no webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      
      const { consultor_stripe_id, comissao_valor, produto_id } = paymentIntent.metadata;
      
      // Atualizar status da venda
      await supabase
        .from('vendas')
        .update({ status: 'pago' })
        .eq('stripe_payment_intent_id', paymentIntent.id);
      
      // Transferir comissão automaticamente
      if (consultor_stripe_id && comissao_valor) {
        try {
          await stripe.transfers.create({
            amount: parseInt(comissao_valor),
            currency: 'brl',
            destination: consultor_stripe_id,
            description: `Comissão - Produto ${produto_id}`,
            source_transaction: paymentIntent.charges.data[0].id
          });
          
          console.log('✅ Comissão transferida:', comissao_valor);
        } catch (error) {
          console.error('❌ Erro ao transferir comissão:', error);
        }
      }
      break;

    case 'payment_intent.payment_failed':
      console.log('❌ Pagamento falhou');
      break;

    default:
      console.log(`Evento não tratado: ${event.type}`);
  }

  res.json({ received: true });
});

// ============================================
// 5. VERIFICAR STATUS DA CONTA
// ============================================
router.get('/status-conta/:accountId', async (req, res) => {
  try {
    const account = await stripe.accounts.retrieve(req.params.accountId);
    
    res.json({
      success: true,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements
    });

  } catch (error) {
    console.error('Erro ao verificar conta:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 6. CRIAR LINK DE DASHBOARD
// ============================================
router.post('/criar-dashboard-link', async (req, res) => {
  try {
    const { accountId } = req.body;

    const loginLink = await stripe.accounts.createLoginLink(accountId);

    res.json({
      success: true,
      url: loginLink.url
    });

  } catch (error) {
    console.error('Erro ao criar link de dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;