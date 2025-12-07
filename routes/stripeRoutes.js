// Adicione estas rotas no seu backend/routes/stripeRoutes.js

// ============================================
// 7. BUSCAR FATURAS DO CLIENTE
// ============================================
router.get('/faturas/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });

    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      date: new Date(invoice.created * 1000).toISOString().split('T')[0],
      amount: invoice.amount_paid / 100,
      status: invoice.status,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url,
      period_start: new Date(invoice.period_start * 1000).toISOString().split('T')[0],
      period_end: new Date(invoice.period_end * 1000).toISOString().split('T')[0],
    }));

    res.json({
      success: true,
      faturas: formattedInvoices
    });

  } catch (error) {
    console.error('Erro ao buscar faturas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 8. DOWNLOAD DE FATURA ESPECÍFICA
// ============================================
router.get('/faturas/:invoiceId/download', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const invoice = await stripe.invoices.retrieve(invoiceId);
    
    res.json({
      success: true,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url
    });

  } catch (error) {
    console.error('Erro ao buscar fatura:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 9. CRIAR ASSINATURA (PLANO)
// ============================================
router.post('/criar-assinatura', async (req, res) => {
  try {
    const { customerId, priceId, usuarioId, tipo } = req.body;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        usuario_id: usuarioId,
        tipo: tipo // 'lojista' ou 'consultor'
      }
    });

    // Salvar no Supabase
    const tabela = tipo === 'lojista' ? 'lojistas' : 'consultores';
    const { error: updateError } = await supabase
      .from(tabela)
      .update({ 
        stripe_subscription_id: subscription.id,
        plano_ativo: true
      })
      .eq('id', usuarioId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      status: subscription.status
    });

  } catch (error) {
    console.error('Erro ao criar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 10. BUSCAR ASSINATURA ATUAL
// ============================================
router.get('/assinatura/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const price = await stripe.prices.retrieve(subscription.items.data[0].price.id);
    
    res.json({
      success: true,
      assinatura: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000),
        cancel_at_period_end: subscription.cancel_at_period_end,
        preco: {
          id: price.id,
          valor: price.unit_amount / 100,
          intervalo: price.recurring.interval,
          produto: price.product
        }
      }
    });

  } catch (error) {
    console.error('Erro ao buscar assinatura:', error);
    res.status(500).json({ error: error.message });
  }
});