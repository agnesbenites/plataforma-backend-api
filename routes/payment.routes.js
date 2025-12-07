// api-backend/routes/payment.routes.js

const express = require('express');
const router = express.Router();
const {
  createPaymentWithCommission,
  confirmPayment,
  cancelPayment,
  refundPayment,
  getPaymentDetails,
} = require('../utils/stripePayment');

/**
 * 1️⃣ CRIAR PAGAMENTO COM COMISSÃO
 * POST /api/payment/create
 * Body: { vendaId, produtoId (opcional), lojistaId, consultorId, amount }
 */
router.post('/create', async (req, res) => {
  try {
    const { vendaId, produtoId, lojistaId, consultorId, amount } = req.body;

    // Validações (produtoId agora é opcional)
    if (!vendaId || !lojistaId || !consultorId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: vendaId, lojistaId, consultorId, amount. O campo produtoId é opcional.',
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'O valor deve ser maior que zero',
      });
    }

    console.log(`💳 Criando pagamento para venda ${vendaId}`);
    if (produtoId) {
      console.log(`📦 Produto ID: ${produtoId}`);
    } else {
      console.log(`⚠️ Produto ID não informado - usando comissão padrão do lojista`);
    }

    // Criar pagamento (produtoId pode ser null/undefined)
    const result = await createPaymentWithCommission(
      vendaId,
      produtoId || null, // Garante que seja null se undefined
      lojistaId,
      consultorId,
      amount
    );

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json({
      success: true,
      message: 'Pagamento criado com sucesso!',
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      amount: result.amount,
      commissionRate: result.commissionRate,
      commissionType: result.commissionType,
      commissionAmount: result.commissionAmount,
      consultorReceives: result.consultorReceives,
      lojistaReceives: result.lojistaReceives,
    });

  } catch (error) {
    console.error('❌ Erro ao criar pagamento:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 2️⃣ CONFIRMAR PAGAMENTO (chamado pelo webhook)
 * POST /api/payment/confirm
 * Body: { paymentIntentId }
 */
router.post('/confirm', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'paymentIntentId é obrigatório',
      });
    }

    console.log(`🔄 Confirmando pagamento: ${paymentIntentId}`);

    const result = await confirmPayment(paymentIntentId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Erro ao confirmar pagamento:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 3️⃣ CANCELAR PAGAMENTO
 * POST /api/payment/cancel
 * Body: { paymentIntentId, vendaId }
 */
router.post('/cancel', async (req, res) => {
  try {
    const { paymentIntentId, vendaId } = req.body;

    if (!paymentIntentId || !vendaId) {
      return res.status(400).json({
        success: false,
        error: 'paymentIntentId e vendaId são obrigatórios',
      });
    }

    console.log(`🔄 Cancelando pagamento ${paymentIntentId} da venda ${vendaId}`);

    const result = await cancelPayment(paymentIntentId, vendaId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Erro ao cancelar pagamento:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 4️⃣ REEMBOLSAR PAGAMENTO
 * POST /api/payment/refund
 * Body: { paymentIntentId, amount (opcional) }
 */
router.post('/refund', async (req, res) => {
  try {
    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'paymentIntentId é obrigatório',
      });
    }

    console.log(`🔄 Processando reembolso para ${paymentIntentId}`);

    const result = await refundPayment(paymentIntentId, amount);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Erro ao reembolsar pagamento:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 5️⃣ BUSCAR DETALHES DO PAGAMENTO
 * GET /api/payment/details/:paymentIntentId
 */
router.get('/details/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'paymentIntentId é obrigatório',
      });
    }

    console.log(`🔍 Buscando detalhes do pagamento: ${paymentIntentId}`);

    const result = await getPaymentDetails(paymentIntentId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Erro ao buscar detalhes:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;