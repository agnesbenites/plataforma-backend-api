// api-backend/utils/planValidation.js

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Verifica se o lojista pode executar uma ação baseado no plano
 */
async function validatePlanAction(lojistaId, action, data = {}) {
    try {
        // 1. Buscar plano do lojista
        const { data: lojista, error: lojistaError } = await supabase
            .from('lojistas')
            .select('*, plano:planos(*)')
            .eq('id', lojistaId)
            .single();

        if (lojistaError || !lojista) {
            return { allowed: false, error: 'Lojista não encontrado' };
        }

        if (!lojista.plano) {
            return { allowed: false, error: 'Nenhum plano ativo', needsUpgrade: true };
        }

        const plano = lojista.plano;

        // 2. Buscar uso atual
        let { data: uso } = await supabase
            .from('uso_lojista')
            .select('*')
            .eq('lojista_id', lojistaId)
            .maybeSingle();

        if (!uso) {
            const { data: newUso } = await supabase
                .from('uso_lojista')
                .insert({ lojista_id: lojistaId })
                .select()
                .single();
            uso = newUso;
        }

        // 3. Validações por ação
        switch (action) {
            case 'ADD_PRODUTO': {
                const limiteAtual = plano.max_produtos + (uso.pacotes_adicionais_ativos * plano.pacote_adicional_produtos);
                if (uso.total_produtos >= limiteAtual) {
                    return {
                        allowed: false,
                        error: `Limite de ${limiteAtual} produtos atingido`,
                        needsUpgrade: true,
                        currentPlan: plano.nome,
                        addon: plano.permite_adicionais ? {
                            preco: plano.pacote_adicional_preco,
                            beneficios: `+${plano.pacote_adicional_produtos} produtos`
                        } : null
                    };
                }
                break;
            }

            case 'EDIT_PRODUTO': {
                const { data: produto } = await supabase
                    .from('produtos')
                    .select('criado_em')
                    .eq('id', data.produtoId)
                    .single();

                if (produto) {
                    const horasDesdeCriacao = (Date.now() - new Date(produto.criado_em)) / (1000 * 60 * 60);
                    if (horasDesdeCriacao < plano.tempo_bloqueio_produto_horas) {
                        return {
                            allowed: false,
                            error: `Aguarde ${plano.tempo_bloqueio_produto_horas}h após criação`,
                            tempoRestante: Math.ceil(plano.tempo_bloqueio_produto_horas - horasDesdeCriacao),
                            needsUpgrade: true
                        };
                    }
                }
                break;
            }

            case 'ALTER_COMISSAO_PRODUTO': {
                const { data: prod } = await supabase
                    .from('produtos')
                    .select('data_ultima_alteracao_comissao')
                    .eq('id', data.produtoId)
                    .single();

                if (prod?.data_ultima_alteracao_comissao) {
                    const horasDesdeAlteracao = (Date.now() - new Date(prod.data_ultima_alteracao_comissao)) / (1000 * 60 * 60);
                    if (horasDesdeAlteracao < plano.frequencia_alteracao_comissao_produto_horas) {
                        return {
                            allowed: false,
                            error: `Aguarde ${plano.frequencia_alteracao_comissao_produto_horas}h entre alterações`,
                            tempoRestante: Math.ceil(plano.frequencia_alteracao_comissao_produto_horas - horasDesdeAlteracao),
                            needsUpgrade: true
                        };
                    }
                }
                break;
            }

            case 'ALTER_COMISSAO_GLOBAL': {
                if (lojista.data_ultima_alteracao_comissao_global) {
                    const diasDesdeAlteracao = (Date.now() - new Date(lojista.data_ultima_alteracao_comissao_global)) / (1000 * 60 * 60 * 24);
                    if (diasDesdeAlteracao < plano.frequencia_alteracao_comissao_global_dias) {
                        return {
                            allowed: false,
                            error: `Aguarde ${plano.frequencia_alteracao_comissao_global_dias} dias entre alterações`,
                            diasRestantes: Math.ceil(plano.frequencia_alteracao_comissao_global_dias - diasDesdeAlteracao),
                            needsUpgrade: true
                        };
                    }
                }
                break;
            }

            case 'ADD_FILIAL': {
                const limiteAtual = plano.max_filiais + (uso.pacotes_adicionais_ativos * plano.pacote_adicional_filiais);
                if (uso.total_filiais >= limiteAtual) {
                    return {
                        allowed: false,
                        error: `Limite de ${limiteAtual} filiais atingido`,
                        needsUpgrade: true,
                        addon: plano.permite_adicionais ? {
                            preco: plano.pacote_adicional_preco,
                            beneficios: `+${plano.pacote_adicional_filiais} filial`
                        } : null
                    };
                }
                break;
            }

            case 'ADD_VENDEDOR': {
                const limiteAtual = plano.max_vendedores + (uso.pacotes_adicionais_ativos * plano.pacote_adicional_vendedores);
                if (uso.total_vendedores >= limiteAtual) {
                    return {
                        allowed: false,
                        error: `Limite de ${limiteAtual} vendedores atingido`,
                        needsUpgrade: true,
                        addon: plano.permite_adicionais ? {
                            preco: plano.pacote_adicional_preco,
                            beneficios: `+${plano.pacote_adicional_vendedores} vendedores`
                        } : null
                    };
                }
                break;
            }

            case 'ADD_CONSULTOR': {
                if (uso.total_consultores >= plano.max_consultores) {
                    return {
                        allowed: false,
                        error: `Limite de ${plano.max_consultores} consultores atingido`,
                        needsUpgrade: true
                    };
                }
                break;
            }

            case 'VIDEO_CALL': {
                if (!plano.permite_video || plano.chamadas_video_mes === 0) {
                    return { 
                        allowed: false, 
                        error: 'Chamadas de vídeo não disponíveis no seu plano',
                        needsUpgrade: true 
                    };
                }
                
                if (plano.chamadas_video_mes !== 999999) {
                    if (uso.chamadas_video_mes >= plano.chamadas_video_mes) {
                        return {
                            allowed: false,
                            error: `Limite de ${plano.chamadas_video_mes} chamadas/mês atingido`,
                            needsUpgrade: true
                        };
                    }
                }
                break;
            }

            case 'SEND_VIDEO': {
                if (!plano.permite_video) {
                    return { 
                        allowed: false, 
                        error: 'Envio de vídeos não disponível no seu plano',
                        needsUpgrade: true 
                    };
                }
                if (data.duracaoSegundos > plano.duracao_max_video_segundos) {
                    return {
                        allowed: false,
                        error: `Vídeo excede limite de ${plano.duracao_max_video_segundos}s`,
                        needsUpgrade: true
                    };
                }
                break;
            }

            case 'SYNC_ERP': {
                if (!plano.integracao_erp) {
                    return { 
                        allowed: false, 
                        error: 'Integração ERP não disponível no seu plano',
                        needsUpgrade: true 
                    };
                }
                break;
            }

            case 'CHECK_ANALYTICS': {
                const tipo = data.tipo; // 'dia', 'semana', 'mes', 'ano'
                
                if (tipo === 'dia' && !plano.analytics_dia) {
                    return { allowed: false, error: 'Analytics diário não disponível', needsUpgrade: true };
                }
                if (tipo === 'semana' && !plano.analytics_semana) {
                    return { allowed: false, error: 'Analytics semanal não disponível', needsUpgrade: true };
                }
                break;
            }

            default:
                return { allowed: true };
        }

        return { allowed: true, plano, uso };

    } catch (error) {
        console.error('Erro ao validar ação:', error);
        return { allowed: false, error: 'Erro ao validar permissão' };
    }
}

/**
 * Atualiza contadores de uso
 */
async function updateUsage(lojistaId, action, increment = 1) {
    try {
        let updateData = { atualizado_em: new Date().toISOString() };

        switch (action) {
            case 'ADD_PRODUTO':
                const { data: currentProd } = await supabase
                    .from('uso_lojista')
                    .select('total_produtos')
                    .eq('lojista_id', lojistaId)
                    .single();
                updateData.total_produtos = (currentProd?.total_produtos || 0) + increment;
                break;

            case 'ADD_FILIAL':
                const { data: currentFil } = await supabase
                    .from('uso_lojista')
                    .select('total_filiais')
                    .eq('lojista_id', lojistaId)
                    .single();
                updateData.total_filiais = (currentFil?.total_filiais || 0) + increment;
                break;

            case 'ADD_VENDEDOR':
                const { data: currentVend } = await supabase
                    .from('uso_lojista')
                    .select('total_vendedores')
                    .eq('lojista_id', lojistaId)
                    .single();
                updateData.total_vendedores = (currentVend?.total_vendedores || 0) + increment;
                break;

            case 'ADD_CONSULTOR':
                const { data: currentCons } = await supabase
                    .from('uso_lojista')
                    .select('total_consultores')
                    .eq('lojista_id', lojistaId)
                    .single();
                updateData.total_consultores = (currentCons?.total_consultores || 0) + increment;
                break;

            case 'VIDEO_CALL':
                const { data: currentCall } = await supabase
                    .from('uso_lojista')
                    .select('chamadas_video_mes')
                    .eq('lojista_id', lojistaId)
                    .single();
                updateData.chamadas_video_mes = (currentCall?.chamadas_video_mes || 0) + increment;
                break;

            case 'ALTER_COMISSAO_PRODUTO':
                await supabase
                    .from('produtos')
                    .update({ data_ultima_alteracao_comissao: new Date().toISOString() })
                    .eq('id', increment); // increment aqui é o produtoId
                return;

            case 'ALTER_COMISSAO_GLOBAL':
                await supabase
                    .from('lojistas')
                    .update({ data_ultima_alteracao_comissao_global: new Date().toISOString() })
                    .eq('id', lojistaId);
                return;
        }

        if (Object.keys(updateData).length > 1) {
            await supabase
                .from('uso_lojista')
                .update(updateData)
                .eq('lojista_id', lojistaId);
        }

        return { success: true };
    } catch (error) {
        console.error('Erro ao atualizar uso:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Reseta contadores mensais (chamado por cron job)
 */
async function resetMonthlyLimits() {
    try {
        await supabase
            .from('uso_lojista')
            .update({
                chamadas_video_mes: 0,
                ultimo_reset_chamadas: new Date().toISOString().split('T')[0]
            })
            .neq('lojista_id', '');

        return { success: true };
    } catch (error) {
        console.error('Erro ao resetar limites:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { 
    validatePlanAction, 
    updateUsage, 
    resetMonthlyLimits 
};