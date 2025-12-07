// api-backend/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const { checkAuth } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { blockUserInAuth0, unblockUserInAuth0 } = require('../utils/auth0Management');
const supabase = require('../utils/supabaseClient');

// Lista lojistas bloqueados
router.get('/blocked-users', 
  checkAuth, 
  checkRole('admin'), 
  async (req, res) => {
    const { data, error } = await supabase
      .from('lojistas')
      .select('*')
      .eq('status', 'bloqueado')
      .order('data_bloqueio', { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ lojistas: data });
  }
);

// Desbloquear usuário manualmente (Admin)
router.post('/unblock/:lojistaId', 
  checkAuth, 
  checkRole('admin'), 
  async (req, res) => {
    try {
      const { lojistaId } = req.params;
      
      // Busca o lojista
      const { data: lojista, error } = await supabase
        .from('lojistas')
        .select('*')
        .eq('id', lojistaId)
        .single();
      
      if (error || !lojista) {
        return res.status(404).json({ error: 'Lojista não encontrado' });
      }
      
      // Desbloqueia no Auth0
      await unblockUserInAuth0(lojista.auth0_id);
      
      // Atualiza Supabase
      await supabase
        .from('lojistas')
        .update({
          status: 'ativo',
          motivo_bloqueio: null,
          data_bloqueio: null,
          desbloqueado_por_admin: true,
          data_desbloqueio_admin: new Date().toISOString()
        })
        .eq('id', lojistaId);
      
      res.json({
        success: true,
        message: 'Lojista desbloqueado com sucesso'
      });
      
    } catch (error) {
      console.error('Erro ao desbloquear:', error);
      res.status(500).json({ error: 'Erro ao desbloquear lojista' });
    }
  }
);

// Bloquear usuário manualmente (Admin)
router.post('/block/:lojistaId', 
  checkAuth, 
  checkRole('admin'), 
  async (req, res) => {
    try {
      const { lojistaId } = req.params;
      const { motivo } = req.body;
      
      const { data: lojista } = await supabase
        .from('lojistas')
        .select('*')
        .eq('id', lojistaId)
        .single();
      
      if (!lojista) {
        return res.status(404).json({ error: 'Lojista não encontrado' });
      }
      
      // Bloqueia no Auth0
      await blockUserInAuth0(lojista.auth0_id, motivo || 'Bloqueado pelo admin');
      
      // Atualiza Supabase
      await supabase
        .from('lojistas')
        .update({
          status: 'bloqueado',
          motivo_bloqueio: motivo || 'Bloqueado pelo admin',
          data_bloqueio: new Date().toISOString()
        })
        .eq('id', lojistaId);
      
      res.json({
        success: true,
        message: 'Lojista bloqueado com sucesso'
      });
      
    } catch (error) {
      console.error('Erro ao bloquear:', error);
      res.status(500).json({ error: 'Erro ao bloquear lojista' });
    }
  }
);

module.exports = router;