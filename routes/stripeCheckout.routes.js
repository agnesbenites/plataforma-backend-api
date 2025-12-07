// api-backend/routes/stripeCheckout.routes.js

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { validatePlanAction } = require('../utils/planValidation');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * POST /api/checkout/upgrade-plano
 * Criar sessão de checkout para upgrade de plano
 */
router.post('/upgrade-plano', async (req, res) => {
    try {
        const { lojistaId, novoPlanoNome } = req.body;

        // 1. Buscar lojista
        const { data: lojista, error: lojistaError } = await supabase
            .from('lojistas')
            .select('*, plano:planos(*)')
            .eq('id', lojistaId)
            .single();

        if (lojistaError || !lojista) {
            return res.status(404).json({ error: 'Lojista não encontrado' });
        }

        // 2. Buscar novo plano
        const { data: novoPlano, error: planoError } = await supabase
            .from('planos')
            .select('*')
            .eq('nome', novoPlanoNome)
            .single();

        if (planoError || !novoPlano) {
            return res.status(404).json({ error: 'Plano não encontrado' });
        }

        // 3. Validar se é upgrade
        if (lojista.plano && lojista.plano.preco_mensal >= novoPlano.preco_mensal) {
            return res.status(400).json({ 
                error: 'Você só pode fazer upgrade para um plano superior' 
            });
        }

        // 4. Criar ou buscar Stripe Customer
        let customerId = lojista.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: lojista.email,
                name: lojista.nome,
                metadata: {
                    lojista_id: lojistaId
                }
            });
            customerId = customer.id;

            // Salvar customer ID
            await supabase
                .from('lojistas')
                .update({ stripe_customer_id: customerId })
                .eq('id', lojistaId);
        }

        // 5. Criar Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{
                price: novoPlano.stripe_price_id,
                quantity: 1
            }],
            success_url: `${FRONTEND_URL}/lojista/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/lojista/planos?upgrade=canceled`,
            metadata: {
                lojista_id: lojistaId,
                plano_id: novoPlano.id,
                plano_nome: novoPlano.nome,
                tipo_checkout: 'upgrade_plano'
            },
            subscription_data: {
                metadata: {
                    lojista_id: lojistaId,
                    plano_id: novoPlano.id,
                    plano_nome: novoPlano.nome
                }
            }
        });

        res.json({ 
            success: true, 
            checkoutUrl: session.url,
            sessionId: session.id
        });

    } catch (error) {
        console.error('Erro ao criar checkout de upgrade:', error);
        res.status(500).json({ error: 'Erro ao criar checkout' });
    }
});

/**
 * POST /api/checkout/adicional
 * Comprar produto adicional (pacote básico, vendedores, filiais, etc)
 */
router.post('/adicional', async (req, res) => {
    try {
        const { lojistaId, produtoId, quantidade = 1 } = req.body;

        // 1. Buscar lojista com plano
        const { data: lojista, error: lojistaError } = await supabase
            .from('lojistas')
            .select('*, plano:planos(*)')
            .eq('id', lojistaId)
            .single();

        if (lojistaError || !lojista) {
            return res.status(404).json({ error: 'Lojista não encontrado' });
        }

        if (!lojista.plano) {
            return res.status(400).json({ 
                error: 'Você precisa ter um plano ativo para comprar adicionais' 
            });
        }

        // 2. Buscar produto adicional
        const { data: produto, error: produtoError } = await supabase
            .from('produtos_stripe')
            .select('*')
            .eq('id', produtoId)
            .single();

        if (produtoError || !produto) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        // 3. Validar se o plano permite este produto
        if (!produto.planos_permitidos.includes(lojista.plano.nome)) {
            return res.status(403).json({ 
                error: `Este produto só está disponível para: ${produto.planos_permitidos.join(', ')}`,
                planoAtual: lojista.plano.nome
            });
        }

        // 4. Criar Checkout Session
        let customerId = lojista.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: lojista.email,
                name: lojista.nome,
                metadata: { lojista_id: lojistaId }
            });
            customerId = customer.id;

            await supabase
                .from('lojistas')
                .update({ stripe_customer_id: customerId })
                .eq('id', lojistaId);
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{
                price: produto.stripe_price_id,
                quantity: quantidade
            }],
            success_url: `${FRONTEND_URL}/lojista/dashboard?adicional=success`,
            cancel_url: `${FRONTEND_URL}/lojista/dashboard?adicional=canceled`,
            metadata: {
                lojista_id: lojistaId,
                produto_stripe_id: produtoId,
                tipo_produto: produto.tipo,
                quantidade: quantidade,
                tipo_checkout: 'adicional'
            },
            subscription_data: {
                metadata: {
                    lojista_id: lojistaId,
                    produto_stripe_id: produtoId,
                    tipo_produto: produto.tipo
                }
            }
        });

        res.json({ 
            success: true, 
            checkoutUrl: session.url,
            sessionId: session.id
        });

    } catch (error) {
        console.error('Erro ao criar checkout de adicional:', error);
        res.status(500).json({ error: 'Erro ao criar checkout' });
    }
});

/**
 * POST /api/checkout/campanha
 * Comprar campanha de marketing
 */
router.post('/campanha', async (req, res) => {
    try {
        const { lojistaId, dias } = req.body;

        if (!dias || dias < 1) {
            return res.status(400).json({ error: 'Número de dias inválido' });
        }

        // 1. Buscar lojista com plano
        const { data: lojista, error: lojistaError } = await supabase
            .from('lojistas')
            .select('*, plano:planos(*)')
            .eq('id', lojistaId)
            .single();

        if (lojistaError || !lojista) {
            return res.status(404).json({ error: 'Lojista não encontrado' });
        }

        if (!lojista.plano) {
            return res.status(400).json({ 
                error: 'Você precisa ter um plano ativo para comprar campanhas' 
            });
        }

        // 2. Buscar produto de campanha
        const { data: campanha, error: campanhaError } = await supabase
            .from('produtos_stripe')
            .select('*')
            .eq('tipo', 'campanha')
            .single();

        if (campanhaError || !campanha) {
            return res.status(500).json({ error: 'Produto de campanha não configurado' });
        }

        // 3. Definir alcance baseado no plano
        const alcanceKm = lojista.plano.alcance_campanha_km;
        const valorTotal = campanha.preco * dias;

        // 4. Criar Checkout Session
        let customerId = lojista.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: lojista.email,
                name: lojista.nome,
                metadata: { lojista_id: lojistaId }
            });
            customerId = customer.id;

            await supabase
                .from('lojistas')
                .update({ stripe_customer_id: customerId })
                .eq('id', lojistaId);
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'payment',
            line_items: [{
                price: campanha.stripe_price_id,
                quantity: dias
            }],
            success_url: `${FRONTEND_URL}/lojista/campanhas/configurar?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/lojista/campanhas?payment=canceled`,
            metadata: {
                lojista_id: lojistaId,
                tipo_checkout: 'campanha_marketing',
                dias_comprados: dias,
                alcance_km: alcanceKm,
                plano_nome: lojista.plano.nome
            }
        });

        res.json({ 
            success: true, 
            checkoutUrl: session.url,
            sessionId: session.id,
            diasComprados: dias,
            valorTotal: valorTotal,
            alcanceKm: alcanceKm
        });

    } catch (error) {
        console.error('Erro ao criar checkout de campanha:', error);
        res.status(500).json({ error: 'Erro ao criar checkout' });
    }
});

/**
 * GET /api/checkout/session/:sessionId
 * Verificar status de uma sessão de checkout
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        res.json({
            status: session.payment_status,
            metadata: session.metadata
        });

    } catch (error) {
        console.error('Erro ao buscar sessão:', error);
        res.status(500).json({ error: 'Erro ao buscar sessão' });
    }
});

module.exports = router;