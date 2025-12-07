// api-backend/routes/billingRoutes.js

const express = require('express');
const Stripe = require('stripe');
const supabase = require('../utils/supabaseClient.js');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ CORREÇÃO FINAL: Usando o nome do arquivo correto: authMiddleware
const authMiddleware = require('../middlewares/authMiddleware'); 
const stripeController = require('../controllers/stripeController'); 

// -------------------------------------------------------------------------------------
// === ROTAS PROTEGIDAS POR AUTENTICAÇÃO ===

// GET /api/lojista/dados-pagamento (Rota de Assinatura)
router.get(
    '/lojista/dados-pagamento', 
    authMiddleware.checkAuth, 
    stripeController.getDadosPagamentoLojista
);

// POST /api/stripe/criar-conta-lojista (Configuração de Conta)
router.post(
    '/stripe/criar-conta-lojista', 
    authMiddleware.checkAuth,
    stripeController.criarContaStripeLojista
);

// === SALVAR VENDA PENDENTE (PROTECIDA) ===
router.post(
    '/vendas/salvar-venda-pendente', 
    authMiddleware.checkAuth, // 🛑 PROTEÇÃO ADICIONADA
    async (req, res) => {
        try {
            // Pega o ID do Lojista do token JWT (ID seguro)
            const lojista_id = req.user.id; 
            
            const { consultor_id, valor, descricao, produtos } = req.body;

            if (!consultor_id || !valor) {
                return res.status(400).json({ 
                    error: 'consultor_id e valor são obrigatórios' 
                });
            }

            // Inserir venda pendente
            const { data, error } = await supabase
                .from('vendas')
                .insert([
                    {
                        lojista_id, // 🛑 USANDO ID DO TOKEN
                        consultor_id,
                        valor,
                        descricao: descricao || 'Venda via plataforma',
                        status: 'pendente',
                        produtos: produtos || []
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            res.json({ 
                success: true, 
                venda: data,
                message: 'Venda salva com status pendente'
            });

        } catch (error) {
            console.error('Erro ao salvar venda:', error);
            res.status(500).json({ 
                error: 'Erro interno ao salvar venda' 
            });
        }
    }
);

// === BUSCAR VENDA (PROTECIDA) ===
router.get(
    '/vendas/:vendaId', 
    authMiddleware.checkAuth, // 🛑 PROTEÇÃO ADICIONADA
    async (req, res) => {
        try {
            const { vendaId } = req.params;
            const lojista_id_token = req.user.id; // ID do usuário logado

            const { data: venda, error } = await supabase
                .from('vendas')
                .select('*')
                .eq('id', vendaId)
                .single();

            if (error || !venda) {
                return res.status(404).json({ error: 'Venda não encontrada' });
            }
            
            // 🛑 SEGURANÇA: Garantir que o lojista só veja suas próprias vendas
            if (venda.lojista_id !== lojista_id_token) {
                return res.status(403).json({ error: 'Acesso negado a esta venda.' });
            }

            res.json({ venda: venda });

        } catch (error) {
            console.error('Erro ao buscar venda:', error);
            res.status(500).json({ error: 'Erro interno ao buscar venda' });
        }
    }
);

// === CRIAR CONTA STRIPE CONNECT PARA CONSULTOR ===
router.post('/consultores/criar-conta', async (req, res) => {
    // ... (mantido inalterado)
});

// === PROCESSAR PAGAMENTO NO CAIXA ===
router.post('/vendas/processar-pagamento', async (req, res) => {
    // ... (mantido inalterado)
});

// === VERIFICAR STATUS DO STRIPE ===
router.get('/stripe/status', async (req, res) => {
    // ... (mantido inalterado)
});

module.exports = router;