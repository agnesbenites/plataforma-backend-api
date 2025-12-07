// api-backend/controllers/stripeController.js

const supabase = require('../utils/supabaseClient.js'); // Ajuste o caminho conforme o seu projeto
const Stripe = require('stripe');
// O Stripe deve ser inicializado APENAS UMA VEZ no seu server.js/index.js, 
// mas para fins de modularidade, inicializamos aqui se o seu roteador não o fizer.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); 

/**
 * Endpoint: GET /api/lojista/dados-pagamento
 * Requisito: A rota DEVE ter um middleware de autenticação (authMiddleware)
 */
async function getDadosPagamentoLojista(req, res) {
    // Assumindo que o middleware de autenticação injetou o ID do usuário (lojista)
    const lojistaId = req.user.id; 

    if (!lojistaId) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    try {
        // 1. Buscar dados do Lojista no Supabase
        const { data: lojistaData, error: lojistaError } = await supabase
            .from('lojistas') // Tabela de lojistas
            .select('nome, email, stripe_customer_id, stripe_account_id')
            .eq('id', lojistaId)
            .single();

        if (lojistaError || !lojistaData) {
            console.error('Erro Supabase (Lojista):', lojistaError);
            return res.status(404).json({ error: 'Lojista não encontrado.' });
        }

        const { stripe_customer_id, stripe_account_id, nome, email } = lojistaData;
        
        let planoAtual = null;
        let faturas = [];
        
        // 2. Buscar Assinatura no Stripe (apenas se o cliente existir)
        if (stripe_customer_id) {
            
            // Lógica para buscar assinatura ativa (simplificada)
            const subscriptions = await stripe.subscriptions.list({
                customer: stripe_customer_id,
                status: 'active',
                limit: 1,
            });

            if (subscriptions.data.length > 0) {
                const sub = subscriptions.data[0];
                planoAtual = {
                    nome: "Plano Ativo",
                    valor: sub.items.data[0].price.unit_amount / 100,
                    status: sub.status,
                    recursos: ["Acesso Completo"],
                };
            }

            // Lógica para buscar faturas
            const invoices = await stripe.invoices.list({ customer: stripe_customer_id, limit: 5 });
            faturas = invoices.data.map(inv => ({
                id: inv.id,
                number: inv.number,
                date: new Date(inv.created * 1000).toISOString(),
                amount: inv.amount_paid / 100, 
                status: inv.status, 
                hosted_invoice_url: inv.hosted_invoice_url,
                invoice_pdf: inv.invoice_pdf,
            }));
        }

        // 3. Retornar os dados na estrutura que o Frontend espera
        const responseData = {
            user: {
                id: lojistaId,
                nome: nome,
                email: email,
                stripe_customer_id: stripe_customer_id,
                stripe_account_id: stripe_account_id,
            },
            planoAtual: planoAtual || { nome: "Plano Gratuito", valor: 0, status: "inactive", recursos: [] },
            faturas: faturas,
        };
        
        console.log('✅ Dados de Pagamento Lojista coletados.');
        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ Erro no controller getDadosPagamentoLojista:', error);
        res.status(500).json({ error: 'Erro interno ao carregar dados de pagamento.' });
    }
}


// --- Outras Funções de Configuração Stripe ---

/**
 * Endpoint: POST /api/stripe/criar-conta-lojista
 * Cria a conta Connect (se for um Lojista que recebe pagamentos)
 */
async function criarContaStripeLojista(req, res) {
    try {
        const { email, nome, lojistaId } = req.body;
        
        // 1. Criar a conta Stripe (tipo Standard ou Express)
        const account = await stripe.accounts.create({
            type: 'standard', // Usamos standard para lojistas se eles venderem diretamente
            email: email,
            country: 'BR',
            capabilities: { transfers: { requested: true } },
        });

        // 2. Salvar o ID no Supabase
        await supabase.from('lojistas').update({ stripe_account_id: account.id }).eq('id', lojistaId);
        
        // 3. Criar o link de onboarding
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${process.env.FRONTEND_URL}/dashboard/pagamentos`, // URL de refresh
            return_url: `${process.env.FRONTEND_URL}/dashboard/pagamentos`,  // URL de retorno
            type: 'account_onboarding',
        });

        res.json({ success: true, onboardingUrl: accountLink.url });
        
    } catch (error) {
        console.error('Erro Stripe Connect Lojista:', error);
        res.status(500).json({ error: 'Falha ao iniciar o onboarding Stripe.' });
    }
}


module.exports = {
    getDadosPagamentoLojista,
    criarContaStripeLojista,
    // (Adicionar mais funções conforme necessário)
};