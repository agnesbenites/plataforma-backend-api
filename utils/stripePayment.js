// api-backend/utils/stripePayment.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('./supabaseClient'); // Ajuste o caminho se necessário

/**
 * 1️⃣ CRIAR PAYMENT INTENT COM COMISSÃO FLEXÍVEL
 * O dinheiro fica 100% na sua plataforma. As transferências são acionadas via Webhook.
 */
async function createPaymentWithCommission(vendaId, produtoId, lojistaId, consultorId, amount) {
    try {
        console.log(`🔄 Criando pagamento para venda: ${vendaId}. (Fluxo: Pagamentos Separados)`);

        // 1. Buscar dados do PRODUTO (OPCIONAL - pode não existir)
        let produto = null;
        
        if (produtoId) {
            console.log(`🔍 Buscando produto: ${produtoId}`);
            const { data, error } = await supabase
                .from('produtos')
                .select('commission_rate, nome')
                .eq('id', produtoId)
                .single();

            if (error) {
                console.log(`⚠️ Produto ${produtoId} não encontrado no banco. Usando comissão padrão do lojista.`);
                console.log(`   Erro: ${error.message}`);
            } else {
                produto = data;
                console.log(`✅ Produto encontrado: ${produto.nome} (Comissão: ${produto.commission_rate}%)`);
            }
        } else {
            console.log('⚠️ produtoId não informado. Usando comissão padrão do lojista.');
        }

        // 2. Buscar dados do LOJISTA (e sua conta Stripe)
        console.log('🔍 DEBUG - Buscando lojista com ID:', lojistaId);
        console.log('🔍 DEBUG - Tipo do lojistaId:', typeof lojistaId);
        
        const { data: lojista, error: lojistaError } = await supabase
            .from('lojistas')
            .select('default_commission_rate, nome_fantasia, stripe_account_id') 
            .eq('id', lojistaId)
            .single();

        console.log('🔍 DEBUG - Resultado lojista:', lojista);
        console.log('🔍 DEBUG - Erro ao buscar lojista:', lojistaError);

        if (lojistaError) {
            console.error('❌ DEBUG - lojistaError completo:', JSON.stringify(lojistaError, null, 2));
            throw new Error('Lojista não encontrado');
        }
        if (!lojista.stripe_account_id) throw new Error('Lojista não possui conta Stripe Connect configurada.');

        console.log(`✅ Lojista encontrado: ${lojista.nome_fantasia} (Comissão padrão: ${lojista.default_commission_rate}%)`);

        // 3. Buscar dados do CONSULTOR (e sua conta Stripe)
        console.log('🔍 DEBUG - Buscando consultor com ID:', consultorId);
        console.log('🔍 DEBUG - Tipo do consultorId:', typeof consultorId);
        
        const { data: consultor, error: consultorError } = await supabase
            .from('consultores')
            .select('stripe_account_id, stripe_account_status, nome, email')
            .eq('id', consultorId)
            .single();

        console.log('🔍 DEBUG - Resultado consultor:', consultor);
        console.log('🔍 DEBUG - Erro ao buscar consultor:', consultorError);

        if (consultorError) {
            console.error('❌ DEBUG - consultorError completo:', JSON.stringify(consultorError, null, 2));
            throw new Error('Consultor não encontrado');
        }
        if (!consultor.stripe_account_id) throw new Error('Consultor não possui conta Stripe Connect configurada.');

        console.log(`✅ Consultor encontrado: ${consultor.nome}`);

        // 4. DECIDIR QUAL COMISSÃO USAR 🎯
        let commissionRate;
        let commissionType;

        if (produto && produto.commission_rate !== null && produto.commission_rate !== undefined) {
            // Usar comissão específica do produto
            commissionRate = parseFloat(produto.commission_rate);
            commissionType = 'product';
            console.log(`📦 Usando comissão do PRODUTO: ${commissionRate}%`);
        } else {
            // Usar comissão padrão do lojista
            commissionRate = parseFloat(lojista.default_commission_rate) || 10; // Default 10%
            commissionType = 'store';
            console.log(`🏪 Usando comissão padrão do LOJISTA: ${commissionRate}%`);
        }

        // 5. CALCULAR VALORES (Todos em centavos)
        const commissionAmountConsultor = Math.round(amount * (commissionRate / 100)); 
        const amountToTransferLojistaBruto = amount - commissionAmountConsultor; 

        console.log(`💰 Total: R$ ${(amount/100).toFixed(2)}`);
        console.log(`💰 Comissão Consultor (${commissionRate}%): R$ ${(commissionAmountConsultor/100).toFixed(2)}`);
        console.log(`💰 Lojista recebe (bruto): R$ ${(amountToTransferLojistaBruto/100).toFixed(2)}`);

        // 6. CRIAR PAYMENT INTENT NO STRIPE (100% PARA SUA PLATAFORMA)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount, // Valor em centavos
            currency: 'brl',
            // O dinheiro fica 100% na sua conta. Repasse via Webhook.
            metadata: {
                venda_id: vendaId.toString(),
                lojista_id: lojistaId.toString(),
                consultor_id: consultorId.toString(),
                produto_id: produtoId ? produtoId.toString() : 'N/A',
                
                // IDs das Contas para o Webhook:
                lojista_stripe_account_id: lojista.stripe_account_id, 
                consultor_stripe_account_id: consultor.stripe_account_id,
                
                // Valores de Repasse (em centavos)
                valor_total_venda: amount.toString(),
                comissao_consultor_valor: commissionAmountConsultor.toString(),
                valor_bruto_lojista: amountToTransferLojistaBruto.toString(),
            },
        });

        console.log(`✅ Payment Intent criado: ${paymentIntent.id}`);
        console.log(`💳 Client Secret: ${paymentIntent.client_secret.substring(0, 20)}...`);

        // 7. ATUALIZAR TABELA VENDAS com dados do PI e comissão
        const { error: vendaError } = await supabase
            .from('vendas')
            .update({
                stripe_payment_intent_id: paymentIntent.id,
                comissao_percentual: commissionRate,
                comissao_valor: commissionAmountConsultor / 100, // em reais
                commission_type: commissionType,
                consultor_receives_amount: commissionAmountConsultor, // em centavos
                lojista_receives_amount_bruto: amountToTransferLojistaBruto, // em centavos
                status: 'pendente',
                updated_at: new Date().toISOString(),
            })
            .eq('id', vendaId);

        if (vendaError) {
            console.error('❌ Erro ao atualizar venda:', vendaError);
            throw vendaError;
        }

        console.log(`✅ Venda ${vendaId} atualizada com sucesso!`);

        return {
            success: true,
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            amount: amount,
            commissionRate: commissionRate,
            commissionType: commissionType,
            commissionAmount: commissionAmountConsultor,
            consultorReceives: commissionAmountConsultor,
            lojistaReceives: amountToTransferLojistaBruto,
        };

    } catch (error) {
        console.error('❌ Erro ao criar pagamento (utils/stripePayment):', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * 2️⃣ CONFIRMAR PAGAMENTO (WEBHOOK)
 * Esta função é chamada pelo Webhook (evento payment_intent.succeeded) para atualizar o status da venda no DB.
 */
async function confirmPayment(paymentIntentId) {
    try {
        console.log(`🔄 Confirmando pagamento: ${paymentIntentId}`);

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status !== 'succeeded') {
          throw new Error(`Pagamento não foi concluído. Status: ${paymentIntent.status}`);
        }
    
        // 1. Atualizar VENDA para 'pago'
        const { error: vendaError } = await supabase
          .from('vendas')
          .update({
            status: 'pago',
            data_pagamento: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntentId);
    
        if (vendaError) {
            console.error('❌ Erro ao atualizar venda:', vendaError);
            throw vendaError;
        }

        console.log(`✅ Status da Venda atualizado para 'pago': ${paymentIntentId}`);
    
        return {
          success: true,
          message: 'Status de pagamento atualizado com sucesso!',
        };

    } catch (error) {
        console.error('❌ Erro ao confirmar pagamento:', error);
        return {
          success: false,
          error: error.message,
        };
    }
}

/**
 * 3️⃣ CANCELAR PAGAMENTO
 */
async function cancelPayment(paymentIntentId, vendaId) {
    try {
        console.log(`🔄 Cancelando pagamento: ${paymentIntentId}`);

        // Cancelar no Stripe
        await stripe.paymentIntents.cancel(paymentIntentId);

        // Atualizar no Supabase
        const { error } = await supabase
            .from('vendas')
            .update({
                status: 'cancelado',
                data_cancelamento: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', vendaId);

        if (error) {
            console.error('❌ Erro ao atualizar venda:', error);
            throw error;
        }

        console.log(`✅ Pagamento cancelado: ${paymentIntentId}`);

        return {
            success: true,
            message: 'Pagamento cancelado com sucesso!',
        };

    } catch (error) {
        console.error('❌ Erro ao cancelar pagamento:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * 4️⃣ REEMBOLSAR PAGAMENTO
 */
async function refundPayment(paymentIntentId, amount = null) {
    try {
        console.log(`🔄 Criando reembolso para: ${paymentIntentId}`);

        const refundData = {
            payment_intent: paymentIntentId,
        };

        if (amount) {
            refundData.amount = amount;
            console.log(`💰 Valor do reembolso: R$ ${(amount/100).toFixed(2)}`);
        } else {
            console.log('💰 Reembolso total');
        }

        const refund = await stripe.refunds.create(refundData);

        console.log(`✅ Reembolso criado: ${refund.id}`);

        // Atualizar no Supabase
        const { error } = await supabase
            .from('vendas')
            .update({
                status: 'reembolsado',
                updated_at: new Date().toISOString(),
            })
            .eq('stripe_payment_intent_id', paymentIntentId);

        if (error) {
            console.error('❌ Erro ao atualizar venda:', error);
            throw error;
        }

        return {
            success: true,
            refundId: refund.id,
            amount: refund.amount,
            message: 'Reembolso processado com sucesso!',
        };

    } catch (error) {
        console.error('❌ Erro ao processar reembolso:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * 5️⃣ BUSCAR DETALHES DO PAGAMENTO
 */
async function getPaymentDetails(paymentIntentId) {
    try {
        console.log(`🔍 Buscando detalhes do pagamento: ${paymentIntentId}`);

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        return {
            success: true,
            payment: {
                id: paymentIntent.id,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                status: paymentIntent.status,
                created: paymentIntent.created,
                metadata: paymentIntent.metadata,
                application_fee_amount: paymentIntent.application_fee_amount,
                transfer_data: paymentIntent.transfer_data,
            },
        };

    } catch (error) {
        console.error('❌ Erro ao buscar pagamento:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

// 📤 EXPORTAR TODAS AS FUNÇÕES
module.exports = {
    createPaymentWithCommission,
    confirmPayment,
    cancelPayment,
    refundPayment,
    getPaymentDetails,
};