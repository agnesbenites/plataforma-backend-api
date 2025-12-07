// api-backend/src/controllers/scoreController.js

const ScoreService = require('../services/scoreService');
const Candidatura = require('../models/Candidatura');

/**
 * Controller para gerenciar endpoints relacionados ao Score do Consultor
 */
class ScoreController {
  
  /**
   * GET /api/consultores/:id/score
   * Retorna o score completo de um consultor
   * 
   * Permissões:
   * - Lojistas: Podem ver (para avaliar candidaturas)
   * - Admins: Podem ver
   * - Consultores: NÃO podem ver o próprio score
   * 
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  static async getScore(req, res) {
    try {
      const { id } = req.params;
      
      // REGRA CRÍTICA: Consultor não pode ver próprio score
      if (req.user.role === 'consultor' && req.user.id === id) {
        return res.status(403).json({
          error: 'Consultores não podem visualizar seu próprio score',
          message: 'O score é uma métrica interna usada apenas pelos lojistas na avaliação de candidaturas.'
        });
      }
      
      // Verificar se tem permissão
      if (req.user.role !== 'lojista' && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Acesso não autorizado',
          message: 'Apenas lojistas e administradores podem acessar scores de consultores.'
        });
      }
      
      // Buscar score
      const score = await ScoreService.buscarScore(id);
      
      if (!score) {
        return res.status(404).json({
          error: 'Score não encontrado',
          message: 'Nenhum score calculado para este consultor ainda.'
        });
      }
      
      return res.json(score);
      
    } catch (error) {
      console.error('Erro ao buscar score:', error);
      return res.status(500).json({
        error: 'Erro ao buscar score do consultor',
        message: 'Ocorreu um erro interno ao processar sua solicitação.'
      });
    }
  }
  
  /**
   * POST /api/consultores/:id/score/recalcular
   * Força recálculo do score de um consultor
   * 
   * Permissões:
   * - Apenas administradores
   * 
   * Uso:
   * - Debug
   * - Correção manual
   * - Após ajuste de benchmarks
   * 
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  static async recalcular(req, res) {
    try {
      const { id } = req.params;
      
      // Apenas admin pode forçar recálculo
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Apenas administradores podem recalcular scores manualmente.'
        });
      }
      
      console.log(`🔄 Admin ${req.user.id} solicitou recálculo do score do consultor ${id}`);
      
      // Recalcular score
      const score = await ScoreService.calcularScore(id);
      
      console.log(`✅ Score recalculado: ${score.scoreTotal} (${score.nivel})`);
      
      return res.json({
        success: true,
        message: 'Score recalculado com sucesso',
        score
      });
      
    } catch (error) {
      console.error('Erro ao recalcular score:', error);
      return res.status(500).json({
        error: 'Erro ao recalcular score',
        message: error.message
      });
    }
  }
  
  /**
   * POST /api/admin/scores/recalcular-todos
   * Recalcula scores de TODOS os consultores
   * 
   * Permissões:
   * - Apenas administradores
   * 
   * Uso:
   * - Após alteração de benchmarks
   * - Manutenção periódica
   * - Correção em massa
   * 
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  static async recalcularTodos(req, res) {
    try {
      // Apenas admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Apenas administradores podem executar recálculo em massa.'
        });
      }
      
      console.log(`🔄 Admin ${req.user.id} iniciou recálculo de TODOS os scores`);
      
      // Executar recálculo em background (não bloquear resposta)
      // Para não deixar o cliente esperando muito
      res.json({
        success: true,
        message: 'Recálculo de scores iniciado em background',
        status: 'processing'
      });
      
      // Executar assincronamente
      ScoreService.recalcularTodos()
        .then(resultado => {
          console.log(`✅ Recálculo em massa concluído: ${resultado.sucesso} sucessos, ${resultado.erros} erros`);
        })
        .catch(error => {
          console.error('❌ Erro no recálculo em massa:', error);
        });
      
    } catch (error) {
      console.error('Erro ao iniciar recálculo em massa:', error);
      return res.status(500).json({
        error: 'Erro ao iniciar recálculo',
        message: error.message
      });
    }
  }
  
  /**
   * GET /api/lojistas/:lojistaId/candidaturas
   * Lista candidaturas pendentes com scores dos consultores
   * 
   * Permissões:
   * - Lojista: Pode ver apenas suas próprias candidaturas
   * - Admin: Pode ver de qualquer lojista
   * 
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  static async getCandidaturasComScores(req, res) {
    try {
      const { lojistaId } = req.params;
      
      // Verificar permissão
      if (req.user.role === 'lojista' && req.user.id !== lojistaId) {
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Você só pode ver suas próprias candidaturas.'
        });
      }
      
      if (req.user.role !== 'lojista' && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Apenas lojistas e administradores podem acessar candidaturas.'
        });
      }
      
      // Buscar candidaturas pendentes
      const candidaturas = await Candidatura.find({
        lojistaId,
        status: 'pendente'
      })
      .populate('consultorId', 'nome email cidade estado tempoPlataforma lojasAtivas')
      .lean();
      
      if (candidaturas.length === 0) {
        return res.json({
          candidaturas: [],
          message: 'Nenhuma candidatura pendente no momento.'
        });
      }
      
      // Adicionar score a cada candidatura
      const candidaturasComScore = await Promise.all(
        candidaturas.map(async (cand) => {
          try {
            const score = await ScoreService.buscarScore(cand.consultorId._id);
            
            return {
              id: cand._id,
              consultor: {
                id: cand.consultorId._id,
                nome: cand.consultorId.nome,
                email: cand.consultorId.email,
                cidade: cand.consultorId.cidade,
                estado: cand.consultorId.estado,
                tempoPlataforma: cand.consultorId.tempoPlataforma || 'Recém chegado',
                lojasAtivas: cand.consultorId.lojasAtivas || 0,
                score: score || null
              },
              status: cand.status,
              dataCandidatura: cand.createdAt,
              mensagem: cand.mensagem
            };
          } catch (error) {
            console.error(`Erro ao buscar score do consultor ${cand.consultorId._id}:`, error);
            
            // Retornar candidatura sem score em caso de erro
            return {
              id: cand._id,
              consultor: {
                id: cand.consultorId._id,
                nome: cand.consultorId.nome,
                email: cand.consultorId.email,
                cidade: cand.consultorId.cidade,
                estado: cand.consultorId.estado,
                tempoPlataforma: cand.consultorId.tempoPlataforma || 'Recém chegado',
                lojasAtivas: cand.consultorId.lojasAtivas || 0,
                score: null,
                scoreErro: 'Erro ao calcular score'
              },
              status: cand.status,
              dataCandidatura: cand.createdAt,
              mensagem: cand.mensagem
            };
          }
        })
      );
      
      // Ordenar por score (maiores primeiro)
      // Consultores sem score vão para o final
      candidaturasComScore.sort((a, b) => {
        const scoreA = a.consultor.score?.scoreTotal || 0;
        const scoreB = b.consultor.score?.scoreTotal || 0;
        return scoreB - scoreA;
      });
      
      return res.json({
        candidaturas: candidaturasComScore,
        total: candidaturasComScore.length
      });
      
    } catch (error) {
      console.error('Erro ao buscar candidaturas com scores:', error);
      return res.status(500).json({
        error: 'Erro ao buscar candidaturas',
        message: 'Ocorreu um erro ao processar sua solicitação.'
      });
    }
  }
  
  /**
   * GET /api/admin/scores/estatisticas
   * Retorna estatísticas gerais dos scores da plataforma
   * 
   * Permissões:
   * - Apenas administradores
   * 
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  static async getEstatisticas(req, res) {
    try {
      // Apenas admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Acesso negado',
          message: 'Apenas administradores podem acessar estatísticas.'
        });
      }
      
      const ConsultorScore = require('../models/ConsultorScore');
      
      // Buscar todos os scores
      const scores = await ConsultorScore.find({}).lean();
      
      if (scores.length === 0) {
        return res.json({
          message: 'Nenhum score calculado ainda.',
          estatisticas: null
        });
      }
      
      // Calcular estatísticas
      const totalConsultores = scores.length;
      const scoreTotal = scores.reduce((sum, s) => sum + s.scoreTotal, 0);
      const scoreMedia = scoreTotal / totalConsultores;
      
      // Distribuição por nível
      const distribuicaoPorNivel = {
        Diamante: scores.filter(s => s.nivel === 'Diamante').length,
        Ouro: scores.filter(s => s.nivel === 'Ouro').length,
        Prata: scores.filter(s => s.nivel === 'Prata').length,
        Bronze: scores.filter(s => s.nivel === 'Bronze').length,
        Iniciante: scores.filter(s => s.nivel === 'Iniciante').length,
      };
      
      // Top 10 consultores
      const top10 = scores
        .sort((a, b) => b.scoreTotal - a.scoreTotal)
        .slice(0, 10)
        .map(s => ({
          consultorId: s.consultorId,
          scoreTotal: s.scoreTotal,
          nivel: s.nivel,
          ranking: s.ranking
        }));
      
      // Média por componente
      const mediaAvaliacoes = scores.reduce((sum, s) => sum + s.componentes.atendimento.nota, 0) / totalConsultores;
      const mediaVendas = scores.reduce((sum, s) => sum + s.componentes.vendas.nota, 0) / totalConsultores;
      const mediaTreinamentos = scores.reduce((sum, s) => sum + s.componentes.treinamentos.nota, 0) / totalConsultores;
      
      return res.json({
        estatisticas: {
          totalConsultores,
          scoreMedia: parseFloat(scoreMedia.toFixed(2)),
          distribuicaoPorNivel,
          mediaPorComponente: {
            avaliacoes: parseFloat(mediaAvaliacoes.toFixed(2)),
            vendas: parseFloat(mediaVendas.toFixed(2)),
            treinamentos: parseFloat(mediaTreinamentos.toFixed(2))
          },
          top10
        }
      });
      
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return res.status(500).json({
        error: 'Erro ao buscar estatísticas',
        message: error.message
      });
    }
  }
  
  /**
   * GET /api/consultores/:id/metricas-publicas
   * Retorna métricas PÚBLICAS do consultor (sem score)
   * 
   * Permissões:
   * - Todos podem ver
   * 
   * Uso:
   * - Consultor pode ver suas próprias métricas
   * - Sem expor o score numérico
   * 
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  static async getMetricasPublicas(req, res) {
    try {
      const { id } = req.params;
      
      const Avaliacao = require('../models/Avaliacao');
      const Venda = require('../models/Venda');
      const ConsultorTreinamento = require('../models/ConsultorTreinamento');
      
      // Buscar métricas individuais (SEM SCORE)
      const avaliacoes = await Avaliacao.find({ consultorId: id });
      const vendas = await Venda.find({ consultorId: id, status: 'concluida' });
      const treinamentos = await ConsultorTreinamento.find({ consultorId: id });
      
      const avaliacaoMedia = avaliacoes.length > 0
        ? avaliacoes.reduce((sum, a) => sum + a.estrelas, 0) / avaliacoes.length
        : 0;
      
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - 30);
      const vendasUltimos30Dias = vendas.filter(v => v.createdAt >= dataLimite).length;
      
      const treinamentosObrigatorios = treinamentos.filter(t => t.obrigatorio);
      const obrigatoriosConcluidos = treinamentosObrigatorios.every(t => t.concluido);
      
      return res.json({
        avaliacoes: {
          media: parseFloat(avaliacaoMedia.toFixed(1)),
          total: avaliacoes.length
        },
        vendas: {
          total: vendas.length,
          ultimos30Dias: vendasUltimos30Dias
        },
        treinamentos: {
          total: treinamentos.length,
          concluidos: treinamentos.filter(t => t.concluido).length,
          obrigatoriosConcluidos
        }
        // NOTA: Score NÃO é incluído aqui
      });
      
    } catch (error) {
      console.error('Erro ao buscar métricas públicas:', error);
      return res.status(500).json({
        error: 'Erro ao buscar métricas',
        message: error.message
      });
    }
  }
}

module.exports = ScoreController;