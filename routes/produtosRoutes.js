// api-backend/routes/produtosRoutes.js

const express = require('express');
const router = express.Router();
const { requirePlan } = require('../middlewares/planMiddleware');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * POST /api/produtos
 * Criar novo produto (com validação de plano)
 */
router.post('/', requirePlan('ADD_PRODUTO'), async (req, res) => {
    try {
        const { lojistaId, nome, preco } = req.body;

        // Criar produto
        const { data: produto, error } = await supabase
            .from('produtos')
            .insert({
                lojista_id: lojistaId,
                nome,
                preco,
                criado_em: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Atualizar contador de uso
        await req.updatePlanUsage();

        res.json({ 
            success: true, 
            produto,
            message: 'Produto criado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar produto:', error);
        res.status(500).json({ error: 'Erro ao criar produto' });
    }
});

/**
 * PUT /api/produtos/:id
 * Editar produto (com validação de tempo de bloqueio)
 */
router.put('/:id', requirePlan('EDIT_PRODUTO'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, preco } = req.body;

        const { data, error } = await supabase
            .from('produtos')
            .update({ 
                nome, 
                preco,
                atualizado_em: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, produto: data });

    } catch (error) {
        console.error('Erro ao editar produto:', error);
        res.status(500).json({ error: 'Erro ao editar produto' });
    }
});

/**
 * PATCH /api/produtos/:id/comissao
 * Alterar comissão do produto (com validação de frequência)
 */
router.patch('/:id/comissao', requirePlan('ALTER_COMISSAO_PRODUTO'), async (req, res) => {
    try {
        const { id } = req.params;
        const { novaComissao } = req.body;

        const { data, error } = await supabase
            .from('produtos')
            .update({ 
                comissao: novaComissao,
                data_ultima_alteracao_comissao: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Atualizar timestamp de alteração
        await req.updatePlanUsage(id);

        res.json({ success: true, produto: data });

    } catch (error) {
        console.error('Erro ao alterar comissão:', error);
        res.status(500).json({ error: 'Erro ao alterar comissão' });
    }
});

module.exports = router;