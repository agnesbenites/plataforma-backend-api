const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Função auxiliar para registrar mensagem na auditoria
async function registrarAuditoria(usuario1_id, usuario2_id, mensagem, tipo = 'texto', metadata = null) {
  try {
    const { error } = await supabase
      .from('auditoria_chats')
      .insert({
        usuario1_id,
        usuario2_id,
        mensagem,
        tipo,
        metadata
      });
    
    if (error) {
      console.error('Erro ao registrar auditoria:', error);
    }
  } catch (err) {
    console.error('Erro crítico na auditoria:', err);
  }
}

// Rota para enviar mensagem
router.post('/enviar', async (req, res) => {
  const { de_usuario_id, para_usuario_id, mensagem, tipo, metadata } = req.body;

  try {
    // 1. Salvar mensagem principal
    const { data, error } = await supabase
      .from('mensagens')
      .insert({
        de_usuario_id,
        para_usuario_id,
        mensagem,
        lida: false
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Registrar na auditoria (COMPLIANCE - Cláusula 9)
    await registrarAuditoria(
      de_usuario_id,
      para_usuario_id,
      mensagem,
      tipo || 'texto',
      metadata
    );

    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para buscar mensagens entre dois usuários
router.get('/conversa/:usuario1_id/:usuario2_id', async (req, res) => {
  const { usuario1_id, usuario2_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('mensagens')
      .select('*')
      .or(`and(de_usuario_id.eq.${usuario1_id},para_usuario_id.eq.${usuario2_id}),and(de_usuario_id.eq.${usuario2_id},para_usuario_id.eq.${usuario1_id})`)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ success: true, mensagens: data });
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para marcar mensagem como lida
router.patch('/marcar-lida/:mensagem_id', async (req, res) => {
  const { mensagem_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('mensagens')
      .update({ lida: true })
      .eq('id', mensagem_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao marcar como lida:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;