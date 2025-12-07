// api-backend/src/services/scoreService.js
// Versão para Supabase (PostgreSQL)

const { createClient } = require('@supabase/supabase-js');

// Inicializar cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key para bypass RLS
);

/**
 * Serviço para cálculo e gerenciamento do Score do Consultor
 * Versão adaptada para Supabase (PostgreSQL)
 */
class ScoreService {
  
  /**
   * Calcula a nota de avaliações (0-10)
   */
  static calcularNotaAvaliacoes(avaliacaoMedia, totalAvaliacoes) {
    const notaBase = (avaliacaoMedia / 5.0) * 10;
    const fatorConfianca = Math.min(totalAvaliacoes / 10, 1.0);
    return notaBase * fatorConfianca;
  }

  /**
   * Calcula a nota de vendas (0-10)
   */
  static calcularNotaVendas(totalVendas, vendasUltimos30Dias, ticketMedio) {
    const VENDAS_BENCHMARK = 100;
    const VENDAS_30D_BENCHMARK = 20;
    const TICKET_MEDIO_BENCHMARK = 300;
    
    const notaVolume = Math.min((totalVendas / VENDAS_BENCHMARK) * 10, 10);
    const notaAtividade = Math.min((vendasUltimos30Dias / VENDAS_30D_BENCHMARK) * 10, 10);
    const notaTicket = Math.min((ticketMedio / TICKET_MEDIO_BENCHMARK) * 10, 10);
    
    return (notaVolume * 0.4) + (notaAtividade * 0.4) + (notaTicket * 0.2);
  }

  /**
   * Calcula a nota de treinamentos (0-10)
   */
  static calcularNotaTreinamentos(treinamentosConcluidos, treinamentosTotal, obrigatoriosConcluidos) {
    if (treinamentosTotal === 0) return 0;
    
    const percentualConclusao = (treinamentosConcluidos / treinamentosTotal) * 100;
    let notaBase = (percentualConclusao / 100) * 10;
    
    if (!obrigatoriosConcluidos) {
      notaBase = notaBase * 0.5;
    }
    
    return Math.min(notaBase, 10);
  }

  /**
   * Determina o nível baseado no score
   */
  static determinarNivel(scoreTotal) {
    if (scoreTotal >= 9.0) return 'Diamante';
    if (scoreTotal >= 7.5) return 'Ouro';
    if (scoreTotal >= 6.0) return 'Prata';
    if (scoreTotal >= 4.0) return 'Bronze';
    return 'Iniciante';
  }

  /**
   * Busca dados completos do consultor para cálculo
   */
  static async buscarDadosConsultor(consultorId) {
    try {
      // 1. Buscar avaliações
      const { data: avaliacoes, error: erroAval } = await supabase
        .from('avaliacoes')
        .select('estrelas')
        .eq('consultor_id', consultorId);
      
      if (erroAval) throw erroAval;
      
      const avaliacaoMedia = avaliacoes.length > 0
        ? avaliacoes.reduce((sum, a) => sum + a.estrelas, 0) / avaliacoes.length
        : 0;
      const totalAvaliacoes = avaliacoes.length;
      
      const avaliacoesPositivas = avaliacoes.filter(a => a.estrelas >= 4).length;
      const taxaSatisfacao = avaliacoes.length > 0
        ? (avaliacoesPositivas / avaliacoes.length) * 100
        : 0;

      // 2. Buscar vendas
      const { data: vendas, error: erroVendas } = await supabase
        .from('vendas')
        .select('valor_total, created_at')
        .eq('consultor_id', consultorId)
        .eq('status', 'concluida');
      
      if (erroVendas) throw erroVendas;
      
      const totalVendas = vendas.length;
      
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - 30);
      const vendasUltimos30Dias = vendas.filter(v => 
        new Date(v.created_at) >= dataLimite
      ).length;
      
      const somaValores = vendas.reduce((sum, v) => sum + parseFloat(v.valor_total || 0), 0);
      const ticketMedio = vendas.length > 0 ? somaValores / vendas.length : 0;

      // 3. Buscar treinamentos
      const { data: treinamentos, error: erroTrein } = await supabase
        .from('consultor_treinamentos')
        .select('concluido, obrigatorio')
        .eq('consultor_id', consultorId);
      
      if (erroTrein) throw erroTrein;
      
      const treinamentosTotal = treinamentos.length;
      const treinamentosConcluidos = treinamentos.filter(t => t.concluido).length;
      
      const obrigatorios = treinamentos.filter(t => t.obrigatorio);
      const obrigatoriosConcluidos = obrigatorios.length === 0 ? false : obrigatorios.every(t => t.concluido);

      return {
        avaliacaoMedia,
        totalAvaliacoes,
        taxaSatisfacao,
        totalVendas,
        vendasUltimos30Dias,
        ticketMedio,
        treinamentosTotal,
        treinamentosConcluidos,
        obrigatoriosConcluidos,
      };
    } catch (error) {
      console.error('Erro ao buscar dados do consultor:', error);
      throw error;
    }
  }

  /**
   * Calcula o ranking do consultor
   */
  static async calcularRanking(consultorId, scoreTotal) {
    try {
      // Usar a função SQL do PostgreSQL
      const { data, error } = await supabase
        .rpc('calcular_ranking', { consultor_uuid: consultorId });
      
      if (error) throw error;
      
      return data || 'N/A';
    } catch (error) {
      console.error('Erro ao calcular ranking:', error);
      return 'N/A';
    }
  }

  /**
   * Calcula o score completo do consultor
   */
  static async calcularScore(consultorId) {
    const inicioCalculo = Date.now();
    
    try {
      // 1. Buscar dados
      const dados = await this.buscarDadosConsultor(consultorId);
      
      // 2. Calcular cada componente
      const notaAvaliacoes = this.calcularNotaAvaliacoes(
        dados.avaliacaoMedia,
        dados.totalAvaliacoes
      );
      
      const notaVendas = this.calcularNotaVendas(
        dados.totalVendas,
        dados.vendasUltimos30Dias,
        dados.ticketMedio
      );
      
      const notaTreinamentos = this.calcularNotaTreinamentos(
        dados.treinamentosConcluidos,
        dados.treinamentosTotal,
        dados.obrigatoriosConcluidos
      );
      
      // 3. Aplicar pesos e calcular score total
      const scoreTotal = 
        (notaAvaliacoes * 0.40) + 
        (notaVendas * 0.35) + 
        (notaTreinamentos * 0.25);
      
      // 4. Determinar nível
      const nivel = this.determinarNivel(scoreTotal);
      
      // 5. Calcular ranking
      const ranking = await this.calcularRanking(consultorId, scoreTotal);
      
      const tempoCalculo = Date.now() - inicioCalculo;
      
      // 6. Montar objeto para salvar
      const scoreData = {
        consultor_id: consultorId,
        score_total: parseFloat(scoreTotal.toFixed(1)),
        nivel,
        ranking,
        
        // Atendimento
        atendimento_nota: parseFloat(notaAvaliacoes.toFixed(1)),
        atendimento_peso: 40,
        atendimento_avaliacao_media: parseFloat(dados.avaliacaoMedia.toFixed(1)),
        atendimento_total_avaliacoes: dados.totalAvaliacoes,
        atendimento_taxa_satisfacao: parseFloat(dados.taxaSatisfacao.toFixed(1)),
        atendimento_percentual: Math.round((dados.avaliacaoMedia / 5.0) * 100),
        
        // Vendas
        vendas_nota: parseFloat(notaVendas.toFixed(1)),
        vendas_peso: 35,
        vendas_total: dados.totalVendas,
        vendas_ultimos_30_dias: dados.vendasUltimos30Dias,
        vendas_ticket_medio: parseFloat(dados.ticketMedio.toFixed(2)),
        vendas_percentual: Math.round((notaVendas / 10) * 100),
        
        // Treinamentos
        treinamentos_nota: parseFloat(notaTreinamentos.toFixed(1)),
        treinamentos_peso: 25,
        treinamentos_total: dados.treinamentosTotal,
        treinamentos_concluidos: dados.treinamentosConcluidos,
        treinamentos_obrigatorios_concluidos: dados.obrigatoriosConcluidos,
        treinamentos_percentual: dados.treinamentosTotal > 0 
          ? Math.round((dados.treinamentosConcluidos / dados.treinamentosTotal) * 100)
          : 0,
        
        // Metadados
        versao_calculo: '1.0.0',
        tempo_calculo_ms: tempoCalculo,
        fonte: 'auto',
        ultima_atualizacao: new Date().toISOString(),
      };
      
      // 7. Salvar/atualizar no banco (UPSERT)
      const { data, error } = await supabase
        .from('consultor_scores')
        .upsert(scoreData, {
          onConflict: 'consultor_id',
          returning: 'representation'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`✅ Score calculado: Consultor ${consultorId} = ${scoreTotal.toFixed(1)} (${nivel})`);
      
      return this.formatarScoreParaAPI(data);
      
    } catch (error) {
      console.error('Erro ao calcular score:', error);
      throw error;
    }
  }

  /**
   * Formata o score do formato SQL para o formato da API
   */
  static formatarScoreParaAPI(scoreDB) {
    return {
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
          ticketMedio: scoreDB.vendas_ticket_medio,
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
      ultimaAtualizacao: scoreDB.ultima_atualizacao,
    };
  }

  /**
   * Busca o score de um consultor
   */
  static async buscarScore(consultorId) {
    try {
      const { data, error } = await supabase
        .from('consultor_scores')
        .select('*')
        .eq('consultor_id', consultorId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') { // Not found
          // Score não existe, calcular pela primeira vez
          return await this.calcularScore(consultorId);
        }
        throw error;
      }
      
      // Verificar se precisa atualizar (mais de 1 dia)
      const ultimaAtualizacao = new Date(data.ultima_atualizacao);
      const umDiaAtras = new Date();
      umDiaAtras.setDate(umDiaAtras.getDate() - 1);
      
      if (ultimaAtualizacao < umDiaAtras) {
        return await this.calcularScore(consultorId);
      }
      
      return this.formatarScoreParaAPI(data);
      
    } catch (error) {
      console.error('Erro ao buscar score:', error);
      throw error;
    }
  }

  /**
   * Recalcula scores de todos os consultores (cronjob)
   */
  static async recalcularTodos() {
    try {
      console.log('🔄 Iniciando recálculo de todos os scores...');
      
      // Buscar todos os consultores ativos
      const { data: consultores, error } = await supabase
        .from('consultores')
        .select('id')
        .eq('ativo', true);
      
      if (error) throw error;
      
      let sucesso = 0;
      let erros = 0;
      
      // Processar em lotes de 10 para não sobrecarregar
      const batchSize = 10;
      for (let i = 0; i < consultores.length; i += batchSize) {
        const batch = consultores.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (consultor) => {
            try {
              await this.calcularScore(consultor.id);
              sucesso++;
            } catch (error) {
              console.error(`Erro ao calcular score do consultor ${consultor.id}:`, error);
              erros++;
            }
          })
        );
        
        // Pequena pausa entre lotes
        if (i + batchSize < consultores.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Recalcular rankings após todos os scores
      await supabase.rpc('recalcular_rankings_todos');
      
      console.log(`✅ Recálculo concluído: ${sucesso} sucessos, ${erros} erros`);
      
      return { sucesso, erros };
    } catch (error) {
      console.error('Erro ao recalcular todos os scores:', error);
      throw error;
    }
  }

  /**
   * Busca estatísticas gerais (usando view)
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
   * Busca top N consultores
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
}

module.exports = ScoreService;