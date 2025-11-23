// backend/routes/billingRoutes.js (COMMONJS)

const express = require('express');
const Stripe = require('stripe');
const supabase = require('../utils/supabaseClient.js');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// === SALVAR VENDA PENDENTE ===
router.post('/vendas/salvar-venda-pendente', async (req, res) => {
  try {
    const { vendaId, dadosVenda, status = 'pendente' } = req.body;
    
    console.log('📦 Salvando venda pendente:', vendaId);

    const { data, error } = await supabase
      .from('vendas_pendentes')
      .insert([
        {
          id: vendaId,
          dados_venda: dadosVenda,
          status: status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('❌ Erro Supabase:', error);
      throw error;
    }

    res.json({ 
      success: true, 
      vendaId,
      message: 'Venda salva com sucesso' 
    });
    
  } catch (error) {
    console.error('❌ Erro salvar venda:', error);
    res.status(500).json({ 
      error: 'Erro interno ao salvar venda',
      details: error.message 
    });
  }
});

// === BUSCAR VENDA ===
router.get('/vendas/:vendaId', async (req, res) => {
  try {
    const { vendaId } = req.params;
    
    console.log('🔍 Buscando venda:', vendaId);

    const { data, error } = await supabase
      .from('vendas_pendentes')
      .select('*')
      .eq('id', vendaId)
      .single();

    if (error) {
      console.error('❌ Erro Supabase:', error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({ 
        error: 'Venda não encontrada' 
      });
    }

    res.json(data.dados_venda);
    
  } catch (error) {
    console.error('❌ Erro buscar venda:', error);
    res.status(500).json({ 
      error: 'Erro interno ao buscar venda',
      details: error.message 
    });
  }
});

// === CRIAR CONTA STRIPE CONNECT PARA CONSULTOR ===
router.post('/consultores/criar-conta', async (req, res) => {
  try {
    const { email, nome, cpf } = req.body;

    console.log('👤 Criando conta Stripe para:', email);

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'BR',
      email: email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: 'individual',
      individual: {
        first_name: nome.split(' ')[0],
        last_name: nome.split(' ').slice(1).join(' '),
        email: email,
        id_number: cpf.replace(/\D/g, ''),
      },
      settings: {
        payouts: {
          schedule: {
            interval: 'manual',
          },
        },
      },
    });

    // Salvar no Supabase
    const { error: dbError } = await supabase
      .from('consultores')
      .update({ stripe_account_id: account.id })
      .eq('email', email);

    if (dbError) throw dbError;

    res.json({ 
      success: true, 
      accountId: account.id,
      message: 'Conta Stripe criada com sucesso' 
    });
    
  } catch (error) {
    console.error('❌ Erro criar conta Stripe:', error);
    res.status(500).json({ 
      error: 'Erro ao criar conta Stripe',
      details: error.message 
    });
  }
});

// === PROCESSAR PAGAMENTO NO CAIXA ===
router.post('/vendas/processar-pagamento', async (req, res) => {
  try {
    const { 
      vendaId, 
      valorTotal, 
      consultorAccountId,
      produtos 
    } = req.body;

    console.log('💰 Processando pagamento venda:', vendaId);

    // 1. Criar PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(valorTotal * 100), // em centavos
      currency: 'brl',
      payment_method_types: ['card'],
      capture_method: 'manual',
      transfer_data: {
        destination: consultorAccountId,
      },
      metadata: {
        vendaId: vendaId,
        tipo: 'presencial_qrcode'
      }
    });

    console.log('✅ PaymentIntent criado:', paymentIntent.id);

    // 2. Capturar pagamento (simulando caixa)
    const capturedPayment = await stripe.paymentIntents.capture(paymentIntent.id);
    console.log('✅ Pagamento capturado:', capturedPayment.status);

    if (capturedPayment.status === 'succeeded') {
      // 3. Processar comissões
      console.log('🔄 Processando comissões...');
      
      for (const produto of produtos) {
        if (produto.percentualComissao > 0) {
          const comissaoValor = produto.preco * produto.quantidade * (produto.percentualComissao / 100);
          
          await stripe.transfers.create({
            amount: Math.round(comissaoValor * 100),
            currency: 'brl',
            destination: consultorAccountId,
            source_transaction: capturedPayment.id,
            description: `Comissão: ${produto.nome} - Venda ${vendaId}`
          });

          console.log(`✅ Comissão de R$ ${comissaoValor.toFixed(2)} transferida`);
        }
      }

      // 4. Atualizar status da venda
      const { error: updateError } = await supabase
        .from('vendas_pendentes')
        .update({ 
          status: 'concluida',
          updated_at: new Date().toISOString()
        })
        .eq('id', vendaId);

      if (updateError) throw updateError;

      res.json({
        success: true,
        vendaId: vendaId,
        valor: valorTotal,
        paymentIntentId: paymentIntent.id,
        message: 'Pagamento processado e comissões distribuídas com sucesso'
      });
    }

  } catch (error) {
    console.error('❌ Erro processar pagamento:', error);
    res.status(500).json({ 
      error: 'Erro ao processar pagamento',
      details: error.message 
    });
  }
});

// === VERIFICAR STATUS DO STRIPE ===
router.get('/stripe/status', async (req, res) => {
  try {
    // Testar conexão com Stripe
    const balance = await stripe.balance.retrieve();
    
    res.json({
      stripe: 'conectado',
      currency: balance.available[0]?.currency || 'brl',
      status: 'ativo'
    });
  } catch (error) {
    res.status(500).json({
      stripe: 'erro',
      error: error.message
    });
  }
});

module.exports = router;