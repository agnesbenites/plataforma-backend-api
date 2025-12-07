// api-backend/routes/webhookRoutes.js

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('../utils/supabaseClient');
const { confirmPayment } = require('../utils/stripePayment'); // Importa a função de atualização de status

// Adicione esta nova função para lidar com as transferências
async function handlePaymentIntentSucceeded(paymentIntent) {
    try {
        console.log(`💸 Pagamento Sucedido! PI: ${paymentIntent.id}. Iniciando repasses.`);

        // 1. Obter dados de repasse do metadata (que salvamos no createPaymentWithCommission)
        const {
            lojista_stripe_account_id,
            consultor_stripe_account_id,
            comissao_consultor_valor, // Valor em centavos para o Consultor
            valor_bruto_lojista, // Valor em centavos para o Lojista (antes das taxas Stripe)
            valor_total_venda, // Valor total em centavos
        } = paymentIntent.metadata;

        // VALIDAÇÃO
        if (!lojista_stripe_account_id || !consultor_stripe_account_id) {
            console.error('❌ Metadata incompleto: IDs de conta faltando. Repasse manual necessário.');
            return;
        }

        // 2. CALCULAR VALOR LÍQUIDO DO LOJISTA
        // O Stripe já subtraiu suas taxas de processamento do valor total.
        // O valor líquido restante (após a taxa do Stripe) está em paymentIntent.latest_charge.amount_received
        
        // Vamos usar o valor que queremos transferir (o que restou na nossa conta após as taxas):
        const amountReceived = paymentIntent.charges.data[0].amount_received; // O que realmente entrou na sua conta
        
        // A lógica de repasse precisa ser precisa:
        // Lojista Recebe = amountReceived - comissao_consultor_valor (Transferência 1)
        const amountToTransferLojista = amountReceived - parseInt(comissao_consultor_valor);
        const amountToTransferConsultor = parseInt(comissao_consultor_valor);
        
        // 3. TRANSFERÊNCIA para o LOJISTA
        if (amountToTransferLojista > 50) { // Valor mínimo de transferência (ex: R$0.50)
            console.log(`➡️ Transferindo R$ ${amountToTransferLojista / 100} para Lojista (${lojista_stripe_account_id})`);
            await stripe.transfers.create({
                amount: amountToTransferLojista,
                currency: 'brl',
                destination: lojista_stripe_account_id,
                metadata: { payment_intent_id: paymentIntent.id, destino: 'lojista' }
            });
        } else {
            console.warn('⚠️ Valor muito baixo para repassar ao Lojista. O valor foi retido na plataforma.');
        }


        // 4. TRANSFERÊNCIA para o CONSULTOR
        if (amountToTransferConsultor > 50) { // Valor mínimo de transferência (ex: R$0.50)
            console.log(`➡️ Transferindo R$ ${amountToTransferConsultor / 100} para Consultor (${consultor_stripe_account_id})`);
            await stripe.transfers.create({
                amount: amountToTransferConsultor,
                currency: 'brl',
                destination: consultor_stripe_account_id,
                metadata: { payment_intent_id: paymentIntent.id, destino: 'consultor' }
            });
        } else {
            console.warn('⚠️ Valor de comissão muito baixo para repassar ao Consultor. O valor foi retido na plataforma.');
        }

        // 5. Atualizar o status da venda no Supabase
        await confirmPayment(paymentIntent.id);

        console.log(`✅ Repasses e atualização de status concluídos para PI: ${paymentIntent.id}`);

    } catch (error) {
        console.error('❌ Erro CRÍTICO no repasse do Webhook:', error);
        // NOTA: Em produção, você deve ter um sistema de alerta para repasses que falharam.
    }
}


// ⚠️ IMPORTANTE: Raw body parser para webhooks do Stripe
router.post('/stripe', 
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        let event;
        
        try {
            // Verifica a assinatura do webhook (segurança)
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('❌ Erro na verificação do webhook:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        
        console.log('📨 Webhook recebido:', event.type);
        
        // Processa os eventos
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentIntentSucceeded(event.data.object); // 🎯 Lógica de repasse
                break;
                
            case 'account.updated':
                // ... (Sua lógica existente para atualização de status de consultores) ...
                console.log(`📩 Webhook: Conta atualizada - ${event.data.object.id}`);
                // [Adicione sua lógica existente do account.updated aqui]
                break;

            case 'invoice.payment_succeeded':
                // ... (Sua lógica de assinatura existente aqui, se aplicável) ...
                break;
                
            default:
                console.log(`Evento não tratado: ${event.type}`);
        }
        
        res.json({ received: true });
    }
);

module.exports = router;