// api-backend/middlewares/planMiddleware.js

const { validatePlanAction, updateUsage } = require('../utils/planValidation');

/**
 * Middleware para validar se o lojista pode executar uma ação baseado no plano
 * 
 * USO:
 * router.post('/produtos', checkAuth, requirePlan('ADD_PRODUTO'), async (req, res) => {
 *     // Criar produto...
 * });
 */
function requirePlan(action, options = {}) {
    return async (req, res, next) => {
        try {
            // 1. Pegar ID do lojista
            const lojistaId = req.user?.lojistaId || req.body.lojistaId || req.params.lojistaId || req.query.lojistaId;
            
            if (!lojistaId) {
                return res.status(400).json({
                    success: false,
                    error: 'ID do lojista não fornecido',
                    needsAuth: true
                });
            }

            // 2. Validar a ação
            const validation = await validatePlanAction(lojistaId, action, {
                produtoId: req.params.id || req.body.produtoId,
                duracaoSegundos: req.body.duracaoSegundos,
                tipo: req.body.tipo || req.query.tipo,
                ...options.data
            });

            if (!validation.allowed) {
                return res.status(403).json({
                    success: false,
                    error: validation.error,
                    needsUpgrade: validation.needsUpgrade || false,
                    currentPlan: validation.currentPlan,
                    tempoRestante: validation.tempoRestante,
                    diasRestantes: validation.diasRestantes,
                    addon: validation.addon,
                    suggestion: validation.needsUpgrade ? 'Considere fazer upgrade do seu plano' : null
                });
            }

            // 3. Armazenar info do plano no request para uso posterior
            req.planInfo = {
                plano: validation.plano,
                uso: validation.uso
            };

            // 4. Se auto-update estiver ativado, atualizar uso automaticamente após a ação
            if (options.autoUpdate !== false) {
                // Armazenar a função de update para ser chamada após a ação bem-sucedida
                req.updatePlanUsage = async (customId) => {
                    await updateUsage(lojistaId, action, customId || req.params.id || req.body.id);
                };
            }

            next();

        } catch (error) {
            console.error('Erro no middleware de plano:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro ao verificar permissões do plano'
            });
        }
    };
}

/**
 * Middleware para verificar múltiplas ações de uma vez
 */
function requireAnyPlan(actions = []) {
    return async (req, res, next) => {
        const lojistaId = req.user?.lojistaId || req.body.lojistaId || req.params.lojistaId;
        
        if (!lojistaId) {
            return res.status(400).json({
                success: false,
                error: 'ID do lojista não fornecido'
            });
        }

        // Verificar se ALGUMA das ações é permitida
        const validations = await Promise.all(
            actions.map(action => validatePlanAction(lojistaId, action))
        );

        const hasPermission = validations.some(v => v.allowed);

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                error: 'Nenhuma das ações solicitadas é permitida no seu plano',
                needsUpgrade: true
            });
        }

        next();
    };
}

/**
 * Middleware para adicionar informações do plano à resposta
 */
async function attachPlanInfo(req, res, next) {
    try {
        const lojistaId = req.user?.lojistaId || req.params.lojistaId;
        
        if (lojistaId) {
            const { validatePlanAction } = require('../utils/planValidation');
            const info = await validatePlanAction(lojistaId, 'CHECK_INFO');
            
            if (info.plano) {
                req.planInfo = {
                    plano: info.plano,
                    uso: info.uso
                };
            }
        }
        
        next();
    } catch (error) {
        console.error('Erro ao anexar info do plano:', error);
        next(); // Continua mesmo se der erro
    }
}

module.exports = {
    requirePlan,
    requireAnyPlan,
    attachPlanInfo
};