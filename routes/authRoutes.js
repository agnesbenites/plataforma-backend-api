// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');

// Rota para buscar dados do usuário logado
router.get('/me', async (req, res) => {
  try {
    // Supondo que você tenha middleware de autenticação
    const userId = req.user.id; // Ajuste conforme sua autenticação
    
    const { data: user, error } = await supabase
      .from('lojistas') // ou 'consultores' - ajuste conforme necessário
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    res.json({
      id: user.id,
      email: user.email,
      nome: user.nome,
      stripe_customer_id: user.stripe_customer_id,
      stripe_account_id: user.stripe_account_id,
      stripe_subscription_id: user.stripe_subscription_id,
      // ... outros campos que você precisar
    });

  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;