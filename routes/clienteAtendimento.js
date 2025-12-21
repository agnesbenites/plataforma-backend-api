// routes/clienteAtendimento.js
// Rotas para sistema de matching estilo Uber

const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');

// ========== FUNÇÕES AUXILIARES ==========

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ========== ROTAS ==========

// 🔍 POST /api/cliente/buscar-atendentes
// Buscar consultores/vendedores disponíveis para atendimento
router.post('/buscar-atendentes', async (req, res) => {
  try {
    const { loja_id, produto_id, localizacao_cliente } = req.body;

    if (!loja_id) {
      return res.status(400).json({ message: 'loja_id é obrigatório' });
    }

    // Buscar consultores online da loja
    const { data: consultores, error: consultoresError } = await supabase
      .from('consultores')
      .select(`
        id,
        nome,
        foto_perfil,
        online,
        especialidades
      `)
      .eq('loja_id', loja_id)
      .eq('ativo', true)
      .eq('online', true);

    // Buscar vendedores online da loja
    const { data: vendedores, error: vendedoresError } = await supabase
      .from('vendedores')
      .select(`
        id,
        nome,
        foto_perfil,
        online
      `)
      .eq('loja_id', loja_id)
      .eq('ativo', true)
      .eq('online', true);

    if (consultoresError || vendedoresError) {
      console.error('Erro ao buscar atendentes:', consultoresError || vendedoresError);
      return res.status(500).json({ message: 'Erro ao buscar atendentes' });
    }

    // Buscar avaliações médias de cada atendente
    const atendentesComAvaliacao = [];

    // Processar consultores
    for (const consultor of consultores || []) {
      const { data: avaliacoes } = await supabase
        .from('avaliacoes')
        .select('nota')
        .eq('consultor_id', consultor.id);

      const mediaAvaliacao = avaliacoes && avaliacoes.length > 0
        ? avaliacoes.reduce((sum, av) => sum + av.nota, 0) / avaliacoes.length
        : 0;

      atendentesComAvaliacao.push({
        ...consultor,
        tipo: 'consultor',
        avaliacao_media: parseFloat(mediaAvaliacao.toFixed(1)),
        total_avaliacoes: avaliacoes?.length || 0
      });
    }

    // Processar vendedores
    for (const vendedor of vendedores || []) {
      const { data: avaliacoes } = await supabase
        .from('avaliacoes')
        .select('nota')
        .eq('vendedor_id', vendedor.id);

      const mediaAvaliacao = avaliacoes && avaliacoes.length > 0
        ? avaliacoes.reduce((sum, av) => sum + av.nota, 0) / avaliacoes.length
        : 0;

      atendentesComAvaliacao.push({
        ...vendedor,
        tipo: 'vendedor',
        avaliacao_media: parseFloat(mediaAvaliacao.toFixed(1)),
        total_avaliacoes: avaliacoes?.length || 0
      });
    }

    // Ordenar por avaliação (melhores primeiro)
    atendentesComAvaliacao.sort((a, b) => b.avaliacao_media - a.avaliacao_media);

    console.log(`✅ Encontrados ${atendentesComAvaliacao.length} atendentes disponíveis`);

    res.json({
      atendentes: atendentesComAvaliacao,
      total: atendentesComAvaliacao.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar atendentes:', error);
    res.status(500).json({ message: 'Erro ao buscar atendentes' });
  }
});

// 📞 POST /api/cliente/solicitar-atendimento
// Cliente solicita atendimento com um consultor/vendedor
router.post('/solicitar-atendimento', async (req, res) => {
  try {
    const {
      cliente_id,
      atendente_id,
      tipo_atendente,
      produto_id,
      loja_id,
      distancia_km
    } = req.body;

    if (!cliente_id || !atendente_id || !tipo_atendente || !loja_id) {
      return res.status(400).json({ message: 'Dados incompletos' });
    }

    // Criar atendimento
    const atendimentoData = {
      cliente_id,
      produto_id,
      loja_id,
      status: 'pendente',
      tipo_atendente,
      distancia_km
    };

    if (tipo_atendente === 'consultor') {
      atendimentoData.consultor_id = atendente_id;
    } else {
      atendimentoData.vendedor_id = atendente_id;
    }

    const { data: atendimento, error } = await supabase
      .from('atendimentos')
      .insert(atendimentoData)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar atendimento:', error);
      return res.status(500).json({ message: 'Erro ao criar atendimento' });
    }

    console.log(`✅ Atendimento criado: #${atendimento.id}`);

    // TODO: Enviar notificação push para o atendente

    res.json({
      atendimento,
      message: 'Atendimento solicitado com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao solicitar atendimento:', error);
    res.status(500).json({ message: 'Erro ao solicitar atendimento' });
  }
});

// ✅ PUT /api/cliente/atendimento/:id/aceitar
// Consultor/vendedor aceita o atendimento
router.put('/atendimento/:id/aceitar', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: atendimento, error } = await supabase
      .from('atendimentos')
      .update({
        status: 'aceito',
        aceito_em: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao aceitar atendimento:', error);
      return res.status(500).json({ message: 'Erro ao aceitar atendimento' });
    }

    console.log(`✅ Atendimento #${id} aceito`);

    // TODO: Notificar cliente que atendimento foi aceito

    res.json({
      atendimento,
      message: 'Atendimento aceito'
    });

  } catch (error) {
    console.error('❌ Erro ao aceitar atendimento:', error);
    res.status(500).json({ message: 'Erro ao aceitar atendimento' });
  }
});

// 🏁 PUT /api/cliente/atendimento/:id/finalizar
// Finalizar atendimento
router.put('/atendimento/:id/finalizar', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: atendimento, error } = await supabase
      .from('atendimentos')
      .update({
        status: 'finalizado',
        finalizado_em: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao finalizar atendimento:', error);
      return res.status(500).json({ message: 'Erro ao finalizar atendimento' });
    }

    console.log(`✅ Atendimento #${id} finalizado`);

    res.json({
      atendimento,
      message: 'Atendimento finalizado'
    });

  } catch (error) {
    console.error('❌ Erro ao finalizar atendimento:', error);
    res.status(500).json({ message: 'Erro ao finalizar atendimento' });
  }
});

// ⭐ POST /api/cliente/avaliar-atendimento
// Cliente avalia o atendimento
router.post('/avaliar-atendimento', async (req, res) => {
  try {
    const {
      atendimento_id,
      cliente_id,
      nota,
      comentario
    } = req.body;

    if (!atendimento_id || !cliente_id || !nota) {
      return res.status(400).json({ message: 'Dados incompletos' });
    }

    // Buscar dados do atendimento
    const { data: atendimento, error: atendimentoError } = await supabase
      .from('atendimentos')
      .select('*')
      .eq('id', atendimento_id)
      .single();

    if (atendimentoError || !atendimento) {
      return res.status(404).json({ message: 'Atendimento não encontrado' });
    }

    // Criar avaliação
    const avaliacaoData = {
      cliente_id,
      nota,
      comentario,
      loja_id: atendimento.loja_id,
      produto_id: atendimento.produto_id
    };

    if (atendimento.consultor_id) {
      avaliacaoData.consultor_id = atendimento.consultor_id;
    } else if (atendimento.vendedor_id) {
      avaliacaoData.vendedor_id = atendimento.vendedor_id;
    }

    const { data: avaliacao, error: avaliacaoError } = await supabase
      .from('avaliacoes')
      .insert(avaliacaoData)
      .select()
      .single();

    if (avaliacaoError) {
      console.error('❌ Erro ao criar avaliação:', avaliacaoError);
      return res.status(500).json({ message: 'Erro ao criar avaliação' });
    }

    console.log(`✅ Avaliação criada para atendimento #${atendimento_id}`);

    res.json({
      avaliacao,
      message: 'Avaliação enviada com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao avaliar atendimento:', error);
    res.status(500).json({ message: 'Erro ao avaliar atendimento' });
  }
});

// 💬 GET /api/cliente/atendimento/:id/mensagens
// Buscar mensagens de um atendimento
router.get('/atendimento/:id/mensagens', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: mensagens, error } = await supabase
      .from('mensagens')
      .select('*')
      .eq('atendimento_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar mensagens:', error);
      return res.status(500).json({ message: 'Erro ao buscar mensagens' });
    }

    res.json({ mensagens });

  } catch (error) {
    console.error('❌ Erro ao buscar mensagens:', error);
    res.status(500).json({ message: 'Erro ao buscar mensagens' });
  }
});

// 💬 POST /api/cliente/atendimento/:id/mensagem
// Enviar mensagem em um atendimento
router.post('/atendimento/:id/mensagem', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      remetente_id,
      remetente_tipo,
      mensagem,
      tipo_mensagem = 'texto'
    } = req.body;

    if (!remetente_id || !remetente_tipo || !mensagem) {
      return res.status(400).json({ message: 'Dados incompletos' });
    }

    const { data: novaMensagem, error } = await supabase
      .from('mensagens')
      .insert({
        atendimento_id: id,
        remetente_id,
        remetente_tipo,
        mensagem,
        tipo_mensagem
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      return res.status(500).json({ message: 'Erro ao enviar mensagem' });
    }

    console.log(`✅ Mensagem enviada no atendimento #${id}`);

    // TODO: Enviar notificação em tempo real via WebSocket

    res.json({ mensagem: novaMensagem });

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({ message: 'Erro ao enviar mensagem' });
  }
});

module.exports = router;
