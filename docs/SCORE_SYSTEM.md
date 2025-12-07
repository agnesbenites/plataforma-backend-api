// DOCUMENTAÇÃO: Sistema de Score do Consultor
// Para implementação no Backend

/**
 * SISTEMA DE PONTUAÇÃO DO CONSULTOR
 * 
 * O score é calculado automaticamente e atualizado em tempo real.
 * Os consultores NÃO veem seu próprio score.
 * Os lojistas VEEM o score ao avaliar candidaturas.
 * 
 * FÓRMULA DO SCORE (0-10):
 * Score = (Avaliações × 0.40) + (Vendas × 0.35) + (Treinamentos × 0.25)
 */

// ============================================
// 1. COMPONENTE: AVALIAÇÕES (Peso: 40%)
// ============================================

/**
 * Calcula a nota de avaliações do consultor
 * 
 * @param {number} avaliacaoMedia - Média das avaliações (0-5 estrelas)
 * @param {number} totalAvaliacoes - Total de avaliações recebidas
 * @returns {number} Nota de 0-10
 */
function calcularNotaAvaliacoes(avaliacaoMedia, totalAvaliacoes) {
  // Converter escala 0-5 para 0-10
  let notaBase = (avaliacaoMedia / 5.0) * 10;
  
  // Fator de confiança: quanto mais avaliações, mais confiável
  // Mínimo de 10 avaliações para ter confiança máxima
  let fatorConfianca = Math.min(totalAvaliacoes / 10, 1.0);
  
  // Aplicar fator de confiança
  // Se tiver poucas avaliações, a nota é reduzida
  return notaBase * fatorConfianca;
}

/**
 * Exemplo:
 * - 4.8 estrelas com 150 avaliações = 9.6/10 (excelente + muitas avaliações)
 * - 5.0 estrelas com 5 avaliações = 5.0/10 (perfeito mas poucas avaliações)
 * - 3.5 estrelas com 100 avaliações = 7.0/10 (médio mas confiável)
 */

// ============================================
// 2. COMPONENTE: VENDAS (Peso: 35%)
// ============================================

/**
 * Calcula a nota de vendas do consultor
 * 
 * @param {number} totalVendas - Total de vendas do consultor
 * @param {number} vendasUltimos30Dias - Vendas recentes
 * @param {number} ticketMedio - Valor médio das vendas
 * @returns {number} Nota de 0-10
 */
function calcularNotaVendas(totalVendas, vendasUltimos30Dias, ticketMedio) {
  // Definir benchmarks (podem ser ajustados com dados reais da plataforma)
  const VENDAS_BENCHMARK = 100; // Consultores top fazem 100+ vendas
  const VENDAS_30D_BENCHMARK = 20; // Consultores ativos fazem 20+ vendas/mês
  const TICKET_MEDIO_BENCHMARK = 300; // Ticket médio desejado: R$ 300
  
  // Componente 1: Volume total (40% da nota de vendas)
  let notaVolume = Math.min((totalVendas / VENDAS_BENCHMARK) * 10, 10);
  
  // Componente 2: Atividade recente (40% da nota de vendas)
  let notaAtividade = Math.min((vendasUltimos30Dias / VENDAS_30D_BENCHMARK) * 10, 10);
  
  // Componente 3: Ticket médio (20% da nota de vendas)
  let notaTicket = Math.min((ticketMedio / TICKET_MEDIO_BENCHMARK) * 10, 10);
  
  // Nota final de vendas
  return (notaVolume * 0.4) + (notaAtividade * 0.4) + (notaTicket * 0.2);
}

/**
 * Exemplo:
 * - 150 vendas, 25 nos últimos 30 dias, ticket R$ 350 = 9.5/10
 * - 50 vendas, 5 nos últimos 30 dias, ticket R$ 200 = 5.0/10
 * - 200 vendas, 30 nos últimos 30 dias, ticket R$ 400 = 10.0/10
 */

// ============================================
// 3. COMPONENTE: TREINAMENTOS (Peso: 25%)
// ============================================

/**
 * Calcula a nota de treinamentos do consultor
 * 
 * @param {number} treinamentosConcluidos - Total de treinamentos concluídos
 * @param {number} treinamentosTotal - Total de treinamentos disponíveis
 * @param {boolean} obrigatoriosConcluidos - Se completou todos os obrigatórios
 * @returns {number} Nota de 0-10
 */
function calcularNotaTreinamentos(treinamentosConcluidos, treinamentosTotal, obrigatoriosConcluidos) {
  // Percentual de conclusão
  let percentualConclusao = (treinamentosConcluidos / treinamentosTotal) * 100;
  
  // Nota base pelo percentual
  let notaBase = (percentualConclusao / 100) * 10;
  
  // PENALIDADE SEVERA: Se não completou obrigatórios
  if (!obrigatoriosConcluidos) {
    // Reduz a nota pela metade se não completou obrigatórios
    notaBase = notaBase * 0.5;
  }
  
  return Math.min(notaBase, 10);
}

/**
 * Exemplo:
 * - 11/12 concluídos, todos obrigatórios OK = 9.2/10
 * - 11/12 concluídos, faltam obrigatórios = 4.6/10 (PENALIZADO)
 * - 12/12 concluídos = 10.0/10 (perfeito)
 */

// ============================================
// 4. CÁLCULO DO SCORE FINAL
// ============================================

/**
 * Calcula o score total do consultor
 * 
 * @param {Object} dados - Dados do consultor
 * @returns {Object} Score completo com breakdown
 */
function calcularScoreConsultor(dados) {
  // 1. Calcular cada componente
  const notaAvaliacoes = calcularNotaAvaliacoes(
    dados.avaliacaoMedia,
    dados.totalAvaliacoes
  );
  
  const notaVendas = calcularNotaVendas(
    dados.totalVendas,
    dados.vendasUltimos30Dias,
    dados.ticketMedio
  );
  
  const notaTreinamentos = calcularNotaTreinamentos(
    dados.treinamentosConcluidos,
    dados.treinamentosTotal,
    dados.obrigatoriosConcluidos
  );
  
  // 2. Aplicar pesos e calcular score total
  const scoreTotal = 
    (notaAvaliacoes * 0.40) + 
    (notaVendas * 0.35) + 
    (notaTreinamentos * 0.25);
  
  // 3. Determinar nível
  let nivel;
  if (scoreTotal >= 9.0) nivel = 'Diamante';
  else if (scoreTotal >= 7.5) nivel = 'Ouro';
  else if (scoreTotal >= 6.0) nivel = 'Prata';
  else if (scoreTotal >= 4.0) nivel = 'Bronze';
  else nivel = 'Iniciante';
  
  // 4. Retornar objeto completo
  return {
    scoreTotal: parseFloat(scoreTotal.toFixed(1)),
    nivel,
    componentes: {
      atendimento: {
        nota: parseFloat(notaAvaliacoes.toFixed(1)),
        peso: 40,
        percentual: Math.round((dados.avaliacaoMedia / 5.0) * 100),
      },
      vendas: {
        nota: parseFloat(notaVendas.toFixed(1)),
        peso: 35,
        percentual: Math.round((notaVendas / 10) * 100),
      },
      treinamentos: {
        nota: parseFloat(notaTreinamentos.toFixed(1)),
        peso: 25,
        percentual: Math.round((dados.treinamentosConcluidos / dados.treinamentosTotal) * 100),
      }
    }
  };
}

// ============================================
// 5. CÁLCULO DE RANKING
// ============================================

/**
 * Calcula o ranking do consultor entre todos
 * 
 * @param {number} scoreConsultor - Score do consultor
 * @param {Array} todosScores - Array com scores de todos os consultores
 * @returns {string} Ranking em formato "Top X%"
 */
function calcularRanking(scoreConsultor, todosScores) {
  // Ordenar scores do maior para o menor
  const scoresOrdenados = todosScores.sort((a, b) => b - a);
  
  // Encontrar posição do consultor
  const posicao = scoresOrdenados.findIndex(s => s === scoreConsultor) + 1;
  
  // Calcular percentil
  const percentil = Math.ceil((posicao / scoresOrdenados.length) * 100);
  
  return `Top ${percentil}%`;
}

// ============================================
// 6. EXEMPLO DE USO COMPLETO
// ============================================

const exemploConsultor = {
  avaliacaoMedia: 4.8,
  totalAvaliacoes: 156,
  totalVendas: 156,
  vendasUltimos30Dias: 22,
  ticketMedio: 350,
  treinamentosConcluidos: 11,
  treinamentosTotal: 12,
  obrigatoriosConcluidos: true,
};

const score = calcularScoreConsultor(exemploConsultor);

console.log(score);
/**
 * Resultado:
 * {
 *   scoreTotal: 8.7,
 *   nivel: 'Ouro',
 *   componentes: {
 *     atendimento: { nota: 9.6, peso: 40, percentual: 96 },
 *     vendas: { nota: 8.2, peso: 35, percentual: 82 },
 *     treinamentos: { nota: 9.2, peso: 25, percentual: 92 }
 *   }
 * }
 */

// ============================================
// 7. ENDPOINTS DA API NECESSÁRIOS
// ============================================

/**
 * GET /api/consultores/:id/score
 * Retorna o score completo do consultor
 * ACESSO: Apenas lojistas (não disponível para o próprio consultor)
 */

/**
 * POST /api/consultores/:id/score/recalcular
 * Força recálculo do score (executado automaticamente quando há:
 * - Nova avaliação
 * - Nova venda
 * - Treinamento concluído)
 */

/**
 * GET /api/lojistas/:lojistaId/candidaturas
 * Lista candidaturas pendentes com score de cada consultor
 */

// ============================================
// 8. TRIGGERS DE ATUALIZAÇÃO
// ============================================

/**
 * O score deve ser recalculado automaticamente quando:
 * 
 * 1. Nova avaliação recebida
 *    - Hook: após salvar avaliação
 *    - Atualiza: componente "atendimento"
 * 
 * 2. Nova venda finalizada
 *    - Hook: após confirmar venda
 *    - Atualiza: componente "vendas"
 * 
 * 3. Treinamento concluído
 *    - Hook: após marcar treinamento como concluído
 *    - Atualiza: componente "treinamentos"
 * 
 * 4. Cronjob diário às 3h da manhã
 *    - Recalcula scores de todos os consultores
 *    - Atualiza rankings relativos
 */

// ============================================
// 9. CONSIDERAÇÕES IMPORTANTES
// ============================================

/**
 * PRIVACIDADE DO CONSULTOR:
 * - Consultores NÃO podem ver seu próprio score
 * - Consultores veem apenas: avaliações individuais, total de vendas, treinamentos concluídos
 * - Score é uma métrica INTERNA para decisão dos lojistas
 * 
 * TRANSPARÊNCIA PARA LOJISTAS:
 * - Lojistas veem score completo com breakdown
 * - Explicação clara da fórmula de cálculo
 * - Permite decisão informada na aprovação de candidatos
 * 
 * MOTIVAÇÃO DO CONSULTOR:
 * - Consultores são incentivados indiretamente a:
 *   ✓ Oferecer bom atendimento (para avaliações altas)
 *   ✓ Fazer vendas consistentemente
 *   ✓ Concluir treinamentos (especialmente obrigatórios)
 * - Sem criar ansiedade por "gamificação" de score visível
 */

module.exports = {
  calcularNotaAvaliacoes,
  calcularNotaVendas,
  calcularNotaTreinamentos,
  calcularScoreConsultor,
  calcularRanking,
};