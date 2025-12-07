// api-backend/routes/vendas.routes.js (ATUALIZAÇÃO)

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ====================================================================
// ROTA: Confirmar Pagamento (Caixa Físico)
// ====================================================================
router.post('/confirmar-pagamento', async (req, res) => {
  try {
    const { paymentIntentId, qrCodeData, metodoPagamento, operadorId } = req.body;

    console.log('🏪 Caixa confirmando pagamento:', paymentIntentId);

    // Validações
    if (!paymentIntentId || !qrCodeData) {
      return res.status(400).json({
        success: false,
        error: 'Dados incompletos. paymentIntentId e qrCodeData são obrigatórios'
      });
    }

    // Buscar venda pelo paymentIntentId
    const { data: venda, error: vendaError } = await supabase
      .from('vendas')
      .select('*')
      .eq('payment_intent_id', paymentIntentId)
      .single();

    if (vendaError || !venda) {
      console.error('❌ Venda não encontrada:', vendaError);
      return res.status(404).json({
        success: false,
        error: 'Venda não encontrada'
      });
    }

    // Verificar se já foi pago
    if (venda.status === 'pago') {
      return res.status(400).json({
        success: false,
        error: 'Esta venda já foi confirmada anteriormente'
      });
    }

    // Atualizar status da venda
    const { error: updateError } = await supabase
      .from('vendas')
      .update({
        status: 'pago',
        metodo_pagamento: metodoPagamento || 'caixa_fisico',
        data_pagamento: new Date().toISOString(),
        operador_caixa_id: operadorId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', venda.id);

    if (updateError) {
      console.error('❌ Erro ao atualizar venda:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Erro ao confirmar pagamento'
      });
    }

    // Processar comissões
    await processarComissoes(venda, qrCodeData);

    // Notificar consultor/vendedor (webhook, email, etc)
    // TODO: Implementar notificações

    console.log('✅ Pagamento confirmado:', venda.id);

    res.json({
      success: true,
      vendaId: venda.id,
      valor: venda.valor_total,
      status: 'pago',
      message: 'Pagamento confirmado com sucesso!'
    });

  } catch (error) {
    console.error('❌ Erro ao confirmar pagamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao processar pagamento'
    });
  }
});

// ====================================================================
// FUNÇÃO: Processar Comissões
// ====================================================================
async function processarComissoes(venda, qrCodeData) {
  try {
    console.log('💰 Processando comissões para venda:', venda.id);

    const produtos = qrCodeData.produtos || [];
    
    // Processar cada produto
    for (const produto of produtos) {
      const valorComissao = produto.valorComissao || (produto.preco * produto.quantidade * (produto.percentualComissao / 100));

      // Registrar comissão do consultor
      if (venda.consultor_id) {
        await supabase.from('comissoes').insert({
          venda_id: venda.id,
          consultor_id: venda.consultor_id,
          produto_id: produto.id,
          valor_venda: produto.preco * produto.quantidade,
          percentual_comissao: produto.percentualComissao || 8,
          valor_comissao: valorComissao,
          status: 'pendente', // Admin precisa aprovar
          data_venda: venda.created_at,
          created_at: new Date().toISOString()
        });
      }

      console.log(`✅ Comissão registrada: R$ ${valorComissao.toFixed(2)}`);
    }

    // Atualizar saldo do consultor (se já aprovado automaticamente)
    if (venda.consultor_id) {
      const totalComissao = produtos.reduce((sum, p) => 
        sum + (p.valorComissao || (p.preco * p.quantidade * 0.08)), 0
      );

      await supabase
        .from('consultores')
        .update({
          saldo_disponivel: supabase.raw(`saldo_disponivel + ${totalComissao}`),
          total_comissoes: supabase.raw(`total_comissoes + ${totalComissao}`)
        })
        .eq('id', venda.consultor_id);
    }

    console.log('✅ Comissões processadas com sucesso');

  } catch (error) {
    console.error('❌ Erro ao processar comissões:', error);
    // Não retorna erro para não bloquear a confirmação do pagamento
  }
}

// ====================================================================
// ROTA: Buscar Venda por Payment Intent (para validação do caixa)
// ====================================================================
router.get('/validar-qrcode/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const { data: venda, error } = await supabase
      .from('vendas')
      .select('*, consultores(nome), lojistas(nome_fantasia)')
      .eq('payment_intent_id', paymentIntentId)
      .single();

    if (error || !venda) {
      return res.status(404).json({
        success: false,
        error: 'QR Code inválido ou venda não encontrada'
      });
    }

    // Retornar dados da venda para confirmação
    res.json({
      success: true,
      venda: {
        id: venda.id,
        valorTotal: venda.valor_total,
        status: venda.status,
        consultor: venda.consultores?.nome,
        lojista: venda.lojistas?.nome_fantasia,
        dataCriacao: venda.created_at,
        produtos: venda.produtos || []
      }
    });

  } catch (error) {
    console.error('❌ Erro ao validar QR Code:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao validar QR Code'
    });
  }
});

// ====================================================================
// ROTA: Listar vendas pendentes de confirmação (para o caixa)
// ====================================================================
router.get('/pendentes-caixa/:lojistaId', async (req, res) => {
  try {
    const { lojistaId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const { data: vendas, error } = await supabase
      .from('vendas')
      .select('*, consultores(nome)')
      .eq('lojista_id', lojistaId)
      .eq('status', 'aguardando_pagamento')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ Erro ao buscar vendas:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      vendas: vendas || [],
      total: vendas?.length || 0
    });

  } catch (error) {
    console.error('❌ Erro ao listar vendas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar vendas pendentes'
    });
  }
});

// ====================================================================
// ROTA: Criar Venda (JÁ EXISTENTE - MANTIDA)
// ====================================================================
router.post('/criar', async (req, res) => {
  try {
    const {
      consultorId,
      lojistaId,
      clienteId,
      clienteEmail,
      clienteNome,
      produtos,
      valorTotal
    } = req.body;

    // Validações
    if (!consultorId || !lojistaId || !produtos || !valorTotal) {
      return res.status(400).json({
        success: false,
        error: 'Dados incompletos'
      });
    }

    // Calcular comissão (8% padrão)
    const comissao = valorTotal * 0.08;

    // Inserir venda no Supabase
    const { data: venda, error } = await supabase
      .from('vendas')
      .insert({
        consultor_id: consultorId,
        lojista_id: lojistaId,
        cliente_id: clienteId,
        cliente_email: clienteEmail,
        cliente_nome: clienteNome,
        produtos: produtos,
        valor_total: valorTotal,
        valor_comissao: comissao,
        status: 'aguardando_pagamento',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar venda:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao criar venda'
      });
    }

    console.log('✅ Venda criada:', venda.id);

    res.json({
      success: true,
      vendaId: venda.id,
      comissao: comissao
    });

  } catch (error) {
    console.error('❌ Erro ao criar venda:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao criar venda'
    });
  }
});

// ====================================================================
// ROTA: Enviar QR Code por Email (JÁ EXISTENTE - MANTIDA)
// ====================================================================
router.post('/enviar-qrcode', async (req, res) => {
  try {
    const { vendaId, email, qrCodeData, items, totalValue, clienteNome } = req.body;

    if (!email || !vendaId) {
      return res.status(400).json({
        success: false,
        error: 'Email e vendaId são obrigatórios'
      });
    }

    // TODO: Implementar envio de email real (Nodemailer, SendGrid, etc)
    console.log('📧 Simulando envio de email para:', email);
    console.log('Venda ID:', vendaId);
    console.log('QR Code Data:', qrCodeData);

    res.json({
      success: true,
      message: 'Email enviado com sucesso (simulação)'
    });

  } catch (error) {
    console.error('❌ Erro ao enviar email:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao enviar email'
    });
  }
});

// ====================================================================
// ROTA: Listar Vendas do Consultor (JÁ EXISTENTE - MANTIDA)
// ====================================================================
router.get('/consultor/:consultorId', async (req, res) => {
  try {
    const { consultorId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const { data: vendas, error } = await supabase
      .from('vendas')
      .select('*')
      .eq('consultor_id', consultorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ Erro ao buscar vendas:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      vendas: vendas || [],
      total: vendas?.length || 0
    });

  } catch (error) {
    console.error('❌ Erro ao listar vendas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar vendas'
    });
  }
});

module.exports = router;