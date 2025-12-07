// api-backend/routes/planosRoutes.js

const express = require('express');
const router = express.Router();
const { validatePlanAction } = require('../utils/planValidation');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * GET /api/planos/info/:lojistaId
 * Retorna informações do plano e uso atual do lojista
 */
router.get('/info/:lojistaId', async (req, res) => {
    try {
        const { lojistaId } = req.params;

        // Buscar lojista com plano
        const { data: lojista, error: lojistaError } = await supabase
            .from('lojistas')
            .select('*, plano:planos(*)')
            .eq('id', lojistaId)
            .single();

        if (lojistaError || !lojista) {
            return res.status(404).json({ error: 'Lojista não encontrado' });
        }

        // Buscar uso
        let { data: uso } = await supabase
            .from('uso_lojista')
            .select('*')
            .eq('lojista_id', lojistaId)
            .maybeSingle();

        if (!uso) {
            // Criar registro de uso
            const { data: newUso } = await supabase
                .from('uso_lojista')
                .insert({ lojista_id: lojistaId })
                .select()
                .single();
            uso = newUso;
        }

        res.json({
            plano: lojista.plano,
            uso: uso,
            assinatura: {
                stripe_id: lojista.assinatura_stripe_id,
                status: lojista.status_assinatura,
                data_inicio: lojista.data_inicio_assinatura
            }
        });

    } catch (error) {
        console.error('Erro ao buscar info do plano:', error);
        res.status(500).json({ error: 'Erro ao buscar informações do plano' });
    }
});

/**
 * POST /api/planos/validate
 * Valida se uma ação pode ser executada
 */
router.post('/validate', async (req, res) => {
    try {
        const { lojistaId, action, ...data } = req.body;

        if (!lojistaId || !action) {
            return res.status(400).json({ 
                error: 'lojistaId e action são obrigatórios' 
            });
        }

        const validation = await validatePlanAction(lojistaId, action, data);

        if (!validation.allowed) {
            return res.status(403).json({
                allowed: false,
                error: validation.error,
                needsUpgrade: validation.needsUpgrade,
                tempoRestante: validation.tempoRestante,
                diasRestantes: validation.diasRestantes,
                addon: validation.addon,
                currentPlan: validation.currentPlan
            });
        }

        res.json({
            allowed: true,
            plano: validation.plano?.nome,
            message: 'Ação permitida'
        });

    } catch (error) {
        console.error('Erro ao validar ação:', error);
        res.status(500).json({ error: 'Erro ao validar ação' });
    }
});

/**
 * GET /api/planos/lista
 * Lista todos os planos disponíveis
 */
router.get('/lista', async (req, res) => {
    try {
        const { data: planos, error } = await supabase
            .from('planos')
            .select('*')
            .order('preco_mensal', { ascending: true });

        if (error) throw error;

        res.json({ planos });

    } catch (error) {
        console.error('Erro ao listar planos:', error);
        res.status(500).json({ error: 'Erro ao listar planos' });
    }
});

/**
 * POST /api/planos/upgrade
 * Processa upgrade de plano (integração com Stripe)
 */
router.post('/upgrade', async (req, res) => {
    try {
        const { lojistaId, novoPlanoId, stripePriceId } = req.body;

        // Aqui você integraria com o Stripe para criar/atualizar a assinatura
        // Por enquanto, apenas atualiza no banco

        const { data, error } = await supabase
            .from('lojistas')
            .update({ 
                plano_id: novoPlanoId,
                status_assinatura: 'active'
            })
            .eq('id', lojistaId)
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            success: true, 
            message: 'Plano atualizado com sucesso',
            lojista: data
        });

    } catch (error) {
        console.error('Erro ao fazer upgrade:', error);
        res.status(500).json({ error: 'Erro ao fazer upgrade' });
    }
});

/**
 * POST /api/planos/addon
 * Compra pacote adicional
 */
router.post('/addon', async (req, res) => {
    try {
        const { lojistaId } = req.body;

        // Incrementar pacotes adicionais ativos
        const { data: currentUso } = await supabase
            .from('uso_lojista')
            .select('pacotes_adicionais_ativos')
            .eq('lojista_id', lojistaId)
            .single();

        const { data, error } = await supabase
            .from('uso_lojista')
            .update({ 
                pacotes_adicionais_ativos: (currentUso?.pacotes_adicionais_ativos || 0) + 1 
            })
            .eq('lojista_id', lojistaId)
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            success: true, 
            message: 'Pacote adicional ativado',
            pacotes_ativos: data.pacotes_adicionais_ativos
        });

    } catch (error) {
        console.error('Erro ao ativar addon:', error);
        res.status(500).json({ error: 'Erro ao ativar pacote adicional' });
    }
});

module.exports = router;