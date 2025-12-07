// backend/routes/treinamentosRoutes.js
// Rotas de API para Sistema de Treinamentos

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Inicializar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Middleware de autenticação (ajustar conforme seu sistema)
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  
  // TODO: Validar token real
  req.user = { id: 'user-id-from-token' }; // Substituir por validação real
  next();
};

// ============================================
// LOJISTA - GERENCIAR TREINAMENTOS
// ============================================

/**
 * GET /api/lojistas/:lojistaId/treinamentos
 * Listar todos os treinamentos do lojista
 */
router.get('/lojistas/:lojistaId/treinamentos', authenticate, async (req, res) => {
  const { lojistaId } = req.params;
  
  try {
    const { data, error } = await supabase
      .from('treinamentos')
      .select('*')
      .eq('lojista_id', lojistaId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      success: true,
      treinamentos: data || [] 
    });
  } catch (error) {
    console.error('Erro ao listar treinamentos:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/lojistas/:lojistaId/treinamentos/estatisticas
 * Estatísticas dos treinamentos do lojista
 */
router.get('/lojistas/:lojistaId/treinamentos/estatisticas', authenticate, async (req, res) => {
  const { lojistaId } = req.params;
  
  try {
    // Total de treinamentos
    const { count: total } = await supabase
      .from('treinamentos')
      .select('*', { count: 'exact', head: true })
      .eq('lojista_id', lojistaId);
    
    // Treinamentos ativos
    const { count: ativos } = await supabase
      .from('treinamentos')
      .select('*', { count: 'exact', head: true })
      .eq('lojista_id', lojistaId)
      .eq('ativo', true);
    
    // Consultores inscritos (query mais complexa)
    const { data: treinamentosIds } = await supabase
      .from('treinamentos')
      .select('id')
      .eq('lojista_id', lojistaId);
    
    const ids = treinamentosIds?.map(t => t.id) || [];
    
    let consultoresInscritos = 0;
    if (ids.length > 0) {
      const { count } = await supabase
        .from('consultor_treinamentos')
        .select('consultor_id', { count: 'exact', head: true })
        .in('treinamento_id', ids);
      
      consultoresInscritos = count || 0;
    }
    
    res.json({
      success: true,
      stats: {
        total: total || 0,
        ativos: ativos || 0,
        consultoresInscritos
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/lojistas/:lojistaId/segmentos
 * Listar segmentos disponíveis para o lojista
 */
router.get('/lojistas/:lojistaId/segmentos', authenticate, async (req, res) => {
  const { lojistaId } = req.params;
  
  try {
    // Buscar segmentos únicos dos produtos do lojista
    const { data, error } = await supabase
      .from('produtos')
      .select('segmento')
      .eq('lojista_id', lojistaId)
      .not('segmento', 'is', null);
    
    if (error) throw error;
    
    // Remover duplicatas
    const segmentosUnicos = [...new Set(data.map(p => p.segmento))];
    
    // Formatar resposta
    const segmentos = segmentosUnicos.map(seg => ({
      id: seg,
      nome: formatarNomeSegmento(seg)
    }));
    
    res.json({
      success: true,
      segmentos
    });
  } catch (error) {
    console.error('Erro ao buscar segmentos:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/treinamentos
 * Criar novo treinamento
 */
router.post('/treinamentos', authenticate, async (req, res) => {
  const { 
    titulo, 
    descricao, 
    segmento, 
    nivel, 
    duracao_estimada, 
    obrigatorio, 
    ativo, 
    lojista_id,
    conteudo 
  } = req.body;
  
  // Validações
  if (!titulo || !segmento || !nivel || !duracao_estimada || !lojista_id) {
    return res.status(400).json({ 
      success: false,
      error: 'Campos obrigatórios: titulo, segmento, nivel, duracao_estimada, lojista_id' 
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('treinamentos')
      .insert([{
        titulo,
        descricao,
        segmento,
        categoria: 'produto', // FIXO para lojistas
        nivel,
        duracao_estimada,
        obrigatorio: obrigatorio || false,
        ativo: ativo !== undefined ? ativo : true,
        lojista_id,
        conteudo: conteudo || { modulos: [] }
      }])
      .select();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      message: 'Treinamento criado com sucesso',
      treinamento: data[0]
    });
  } catch (error) {
    console.error('Erro ao criar treinamento:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * PUT /api/treinamentos/:id
 * Atualizar treinamento
 */
router.put('/treinamentos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Garantir que categoria sempre seja 'produto'
  if (updates.categoria) {
    delete updates.categoria;
  }
  updates.categoria = 'produto';
  
  try {
    const { data, error } = await supabase
      .from('treinamentos')
      .update(updates)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Treinamento não encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: 'Treinamento atualizado com sucesso',
      treinamento: data[0]
    });
  } catch (error) {
    console.error('Erro ao atualizar treinamento:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * PATCH /api/treinamentos/:id
 * Ativar/Desativar treinamento
 */
router.patch('/treinamentos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body;
  
  if (ativo === undefined) {
    return res.status(400).json({ 
      success: false,
      error: 'Campo "ativo" é obrigatório' 
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('treinamentos')
      .update({ ativo })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Treinamento não encontrado' 
      });
    }
    
    res.json({
      success: true,
      message: `Treinamento ${ativo ? 'ativado' : 'desativado'} com sucesso`,
      treinamento: data[0]
    });
  } catch (error) {
    console.error('Erro ao alterar status:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * DELETE /api/treinamentos/:id
 * Excluir treinamento
 */
router.delete('/treinamentos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Verificar se existem consultores inscritos
    const { count } = await supabase
      .from('consultor_treinamentos')
      .select('*', { count: 'exact', head: true })
      .eq('treinamento_id', id);
    
    if (count > 0) {
      return res.status(400).json({ 
        success: false,
        error: `Não é possível excluir. ${count} consultor(es) inscrito(s) neste treinamento.` 
      });
    }
    
    const { error } = await supabase
      .from('treinamentos')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Treinamento excluído com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir treinamento:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// CONSULTOR - VISUALIZAR E FAZER TREINAMENTOS
// ============================================

/**
 * GET /api/consultores/:consultorId/treinamentos
 * Listar treinamentos disponíveis para o consultor (filtrado por segmento)
 */
router.get('/consultores/:consultorId/treinamentos', authenticate, async (req, res) => {
  const { consultorId } = req.params;
  
  try {
    // 1. Buscar segmentos do consultor
    const { data: consultor, error: consultorError } = await supabase
      .from('consultores')
      .select('segmentos')
      .eq('id', consultorId)
      .single();
    
    if (consultorError) throw consultorError;
    
    if (!consultor || !consultor.segmentos || consultor.segmentos.length === 0) {
      return res.json({ 
        success: true,
        treinamentos: [] 
      });
    }
    
    // 2. Buscar treinamentos dos segmentos do consultor
    const { data: treinamentos, error: treinamentosError } = await supabase
      .from('treinamentos')
      .select('*')
      .in('segmento', consultor.segmentos)
      .eq('ativo', true)
      .order('obrigatorio', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (treinamentosError) throw treinamentosError;
    
    // 3. Verificar quais já foram concluídos
    const { data: concluidos } = await supabase
      .from('consultor_treinamentos')
      .select('treinamento_id, concluido, data_conclusao, progresso')
      .eq('consultor_id', consultorId);
    
    // 4. Mesclar informações
    const treinamentosComStatus = (treinamentos || []).map(t => {
      const conclusao = concluidos?.find(c => c.treinamento_id === t.id);
      return {
        ...t,
        concluido: conclusao?.concluido || false,
        data_conclusao: conclusao?.data_conclusao || null,
        progresso: conclusao?.progresso || 0
      };
    });
    
    res.json({
      success: true,
      treinamentos: treinamentosComStatus
    });
  } catch (error) {
    console.error('Erro ao buscar treinamentos do consultor:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/consultores/:consultorId/treinamentos/:treinamentoId/concluir
 * Marcar treinamento como concluído
 */
router.post('/consultores/:consultorId/treinamentos/:treinamentoId/concluir', authenticate, async (req, res) => {
  const { consultorId, treinamentoId } = req.params;
  
  try {
    // Verificar se já existe registro
    const { data: existente } = await supabase
      .from('consultor_treinamentos')
      .select('*')
      .eq('consultor_id', consultorId)
      .eq('treinamento_id', treinamentoId)
      .single();
    
    if (existente) {
      // Atualizar
      const { error } = await supabase
        .from('consultor_treinamentos')
        .update({
          concluido: true,
          data_conclusao: new Date().toISOString(),
          progresso: 100
        })
        .eq('consultor_id', consultorId)
        .eq('treinamento_id', treinamentoId);
      
      if (error) throw error;
    } else {
      // Inserir
      const { error } = await supabase
        .from('consultor_treinamentos')
        .insert([{
          consultor_id: consultorId,
          treinamento_id: treinamentoId,
          concluido: true,
          data_conclusao: new Date().toISOString(),
          progresso: 100
        }]);
      
      if (error) throw error;
    }
    
    // TODO: Recalcular score do consultor
    // await recalcularScore(consultorId);
    
    res.json({
      success: true,
      message: 'Treinamento concluído com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao concluir treinamento:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/consultores/:consultorId/treinamentos/progresso
 * Obter progresso geral dos treinamentos
 */
router.get('/consultores/:consultorId/treinamentos/progresso', authenticate, async (req, res) => {
  const { consultorId } = req.params;
  
  try {
    // Buscar segmentos do consultor
    const { data: consultor } = await supabase
      .from('consultores')
      .select('segmentos')
      .eq('id', consultorId)
      .single();
    
    if (!consultor?.segmentos) {
      return res.json({
        success: true,
        progresso: {
          total: 0,
          concluidos: 0,
          percentual: 0,
          obrigatoriosPendentes: 0
        }
      });
    }
    
    // Total de treinamentos disponíveis
    const { count: total } = await supabase
      .from('treinamentos')
      .select('*', { count: 'exact', head: true })
      .in('segmento', consultor.segmentos)
      .eq('ativo', true);
    
    // Total concluídos
    const { count: concluidos } = await supabase
      .from('consultor_treinamentos')
      .select('*', { count: 'exact', head: true })
      .eq('consultor_id', consultorId)
      .eq('concluido', true);
    
    // Obrigatórios pendentes
    const { data: obrigatorios } = await supabase
      .from('treinamentos')
      .select('id')
      .in('segmento', consultor.segmentos)
      .eq('ativo', true)
      .eq('obrigatorio', true);
    
    const idsObrigatorios = obrigatorios?.map(t => t.id) || [];
    
    const { data: obrigatoriosConcluidos } = await supabase
      .from('consultor_treinamentos')
      .select('treinamento_id')
      .eq('consultor_id', consultorId)
      .eq('concluido', true)
      .in('treinamento_id', idsObrigatorios);
    
    const obrigatoriosPendentes = idsObrigatorios.length - (obrigatoriosConcluidos?.length || 0);
    
    const percentual = total > 0 ? Math.round((concluidos / total) * 100) : 0;
    
    res.json({
      success: true,
      progresso: {
        total: total || 0,
        concluidos: concluidos || 0,
        percentual,
        obrigatoriosPendentes
      }
    });
  } catch (error) {
    console.error('Erro ao buscar progresso:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// HELPERS
// ============================================

function formatarNomeSegmento(seg) {
  const nomes = {
    'eletronicos': 'Eletrônicos',
    'smartphones': 'Smartphones',
    'informatica': 'Informática',
    'eletrodomesticos': 'Eletrodomésticos',
    'moveis': 'Móveis',
    'moda': 'Moda e Vestuário',
    'cosmeticos': 'Cosméticos e Beleza',
    'esportes': 'Esportes e Lazer',
    'livros': 'Livros e Papelaria',
    'alimentos': 'Alimentos e Bebidas'
  };
  return nomes[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
}

module.exports = router;