// api-backend/src/models/ConsultorScore.js
// Repository/Helper para trabalhar com a tabela consultor_scores no Supabase

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Repository para manipulação da tabela consultor_scores
 * 
 * Como Supabase usa PostgreSQL, não temos "models" como no Mongoose.
 * Este arquivo funciona como um repository/helper com métodos úteis.
 */
class ConsultorScore {
  
  /**
   * Busca score por ID do consultor
   * @param {number} consultorId 
   * @returns {Object|null}
   */
  static async findByConsultorId(consultorId) {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .select('*')
        .eq('consultor_id', consultorId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar score:', error);
      throw error;
    }
  }
  
  /**
   * Cria ou atualiza score (UPSERT)
   * @param {Object} scoreData 
   * @returns {Object}
   */
  static async upsert(scoreData) {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .upsert(scoreData, {
          onConflict: 'consultor_id',
          returning: 'representation'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao fazer upsert do score:', error);
      throw error;
    }
  }
  
  /**
   * Atualiza score existente
   * @param {number} consultorId 
   * @param {Object} updates 
   * @returns {Object}
   */
  static async update(consultorId, updates) {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .update(updates)
        .eq('consultor_id', consultorId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao atualizar score:', error);
      throw error;
    }
  }
  
  /**
   * Deleta score de um consultor
   * @param {number} consultorId 
   * @returns {boolean}
   */
  static async delete(consultorId) {
    try {
      const { error } = await supabase
        .from('consultor_scores')
        .delete()
        .eq('consultor_id', consultorId);
      
      if (error) throw error;
      
      return true;
    } catch (error) {
      console.error('Erro ao deletar score:', error);
      throw error;
    }
  }
  
  /**
   * Busca todos os scores com filtros
   * @param {Object} filters - { nivel, minScore, maxScore }
   * @param {Object} options - { limit, offset, orderBy }
   * @returns {Array}
   */
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase.from('consultor_scores').select('*');
      
      // Aplicar filtros
      if (filters.nivel) {
        query = query.eq('nivel', filters.nivel);
      }
      if (filters.minScore !== undefined) {
        query = query.gte('score_total', filters.minScore);
      }
      if (filters.maxScore !== undefined) {
        query = query.lte('score_total', filters.maxScore);
      }
      
      // Ordenação
      const orderBy = options.orderBy || 'score_total';
      const orderDirection = options.orderDirection || 'desc';
      query = query.order(orderBy, { ascending: orderDirection === 'asc' });
      
      // Paginação
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar scores:', error);
      throw error;
    }
  }
  
  /**
   * Busca scores desatualizados (para cronjob)
   * @param {number} horasMax 
   * @returns {Array}
   */
  static async findDesatualizados(horasMax = 24) {
    try {
      const { data, error } = await supabase
        .rpc('buscar_scores_desatualizados', { horas_max: horasMax });
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar scores desatualizados:', error);
      throw error;
    }
  }
  
  /**
   * Retorna distribuição de consultores por nível
   * @returns {Object}
   */
  static async getDistribuicaoPorNivel() {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .select('nivel');
      
      if (error) throw error;
      
      const distribuicao = {
        Diamante: 0,
        Ouro: 0,
        Prata: 0,
        Bronze: 0,
        Iniciante: 0
      };
      
      data.forEach(score => {
        distribuicao[score.nivel] = (distribuicao[score.nivel] || 0) + 1;
      });
      
      return distribuicao;
    } catch (error) {
      console.error('Erro ao buscar distribuição:', error);
      throw error;
    }
  }
  
  /**
   * Retorna top N consultores
   * @param {number} limit 
   * @returns {Array}
   */
  static async getTopConsultores(limit = 10) {
    try {
      const { data, error } = await supabase
        .from('v_top_10_consultores')
        .select('*')
        .limit(limit);
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar top consultores:', error);
      throw error;
    }
  }
  
  /**
   * Retorna estatísticas gerais dos scores
   * @returns {Object}
   */
  static async getEstatisticas() {
    try {
      const { data, error } = await supabase
        .from('v_score_estatisticas')
        .select('*')
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      throw error;
    }
  }
  
  /**
   * Conta total de scores
   * @returns {number}
   */
  static async count() {
    try {
      const { count, error } = await supabase
        .from('consultor_scores')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      
      return count;
    } catch (error) {
      console.error('Erro ao contar scores:', error);
      throw error;
    }
  }
  
  /**
   * Recalcula todos os rankings (chama stored procedure)
   * @returns {number} Total de rankings atualizados
   */
  static async recalcularRankings() {
    try {
      const { data, error } = await supabase
        .rpc('recalcular_rankings_todos');
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao recalcular rankings:', error);
      throw error;
    }
  }
  
  /**
   * Busca score com dados do consultor (JOIN)
   * @param {number} consultorId 
   * @returns {Object|null}
   */
  static async findWithConsultor(consultorId) {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .select(`
          *,
          consultores:consultor_id (
            id,
            nome,
            email,
            cidade,
            estado,
            tempo_plataforma,
            lojas_ativas
          )
        `)
        .eq('consultor_id', consultorId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar score com consultor:', error);
      throw error;
    }
  }
  
  /**
   * Busca scores de múltiplos consultores de uma vez
   * @param {Array<number>} consultorIds 
   * @returns {Array}
   */
  static async findMany(consultorIds) {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .select('*')
        .in('consultor_id', consultorIds);
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Erro ao buscar múltiplos scores:', error);
      throw error;
    }
  }
  
  /**
   * Verifica se um score existe
   * @param {number} consultorId 
   * @returns {boolean}
   */
  static async exists(consultorId) {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .select('id')
        .eq('consultor_id', consultorId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return false;
        throw error;
      }
      
      return !!data;
    } catch (error) {
      console.error('Erro ao verificar existência:', error);
      throw error;
    }
  }
  
  /**
   * Formata score do formato DB para formato API
   * @param {Object} scoreDB 
   * @returns {Object}
   */
  static formatarParaAPI(scoreDB) {
    if (!scoreDB) return null;
    
    return {
      id: scoreDB.id,
      consultorId: scoreDB.consultor_id,
      scoreTotal: scoreDB.score_total,
      nivel: scoreDB.nivel,
      ranking: scoreDB.ranking,
      componentes: {
        atendimento: {
          nota: scoreDB.atendimento_nota,
          peso: scoreDB.atendimento_peso,
          avaliacaoMedia: scoreDB.atendimento_avaliacao_media,
          totalAvaliacoes: scoreDB.atendimento_total_avaliacoes,
          taxaSatisfacao: scoreDB.atendimento_taxa_satisfacao,
          percentual: scoreDB.atendimento_percentual,
        },
        vendas: {
          nota: scoreDB.vendas_nota,
          peso: scoreDB.vendas_peso,
          totalVendas: scoreDB.vendas_total,
          vendasUltimos30Dias: scoreDB.vendas_ultimos_30_dias,
          ticketMedio: parseFloat(scoreDB.vendas_ticket_medio),
          percentual: scoreDB.vendas_percentual,
        },
        treinamentos: {
          nota: scoreDB.treinamentos_nota,
          peso: scoreDB.treinamentos_peso,
          total: scoreDB.treinamentos_total,
          concluidos: scoreDB.treinamentos_concluidos,
          obrigatoriosConcluidos: scoreDB.treinamentos_obrigatorios_concluidos,
          percentual: scoreDB.treinamentos_percentual,
        }
      },
      metadata: {
        versaoCalculo: scoreDB.versao_calculo,
        tempoCalculo: scoreDB.tempo_calculo_ms,
        fonte: scoreDB.fonte,
      },
      ultimaAtualizacao: scoreDB.ultima_atualizacao,
      createdAt: scoreDB.created_at,
      updatedAt: scoreDB.updated_at,
    };
  }
  
  /**
   * Retorna ícone do nível
   * @param {string} nivel 
   * @returns {string}
   */
  static getIcone(nivel) {
    const icones = {
      'Diamante': '💎',
      'Ouro': '🥇',
      'Prata': '🥈',
      'Bronze': '🥉',
      'Iniciante': '🌱'
    };
    return icones[nivel] || '❓';
  }
  
  /**
   * Retorna cor do nível
   * @param {string} nivel 
   * @returns {string}
   */
  static getCor(nivel) {
    const cores = {
      'Diamante': '#b9f2ff',
      'Ouro': '#ffd700',
      'Prata': '#c0c0c0',
      'Bronze': '#cd7f32',
      'Iniciante': '#e9ecef'
    };
    return cores[nivel] || '#cccccc';
  }
  
  /**
   * Retorna descrição do nível
   * @param {string} nivel 
   * @returns {string}
   */
  static getDescricaoNivel(nivel) {
    const descricoes = {
      'Diamante': 'Elite - Top Performers',
      'Ouro': 'Excelente - Muito Qualificado',
      'Prata': 'Bom - Qualificado',
      'Bronze': 'Regular - Em Desenvolvimento',
      'Iniciante': 'Novo - Precisa Melhorar'
    };
    return descricoes[nivel] || 'Desconhecido';
  }
}

module.exports = ConsultorScore;