// api-backend/routes/approvalRoutes.js

const express = require('express');
const router = express.Router();
const { checkAuth } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { approveLojista, rejectLojista } = require('../controllers/approvalController');

// Lista de lojistas pendentes (apenas admin)
router.get('/pending', 
  checkAuth, 
  checkRole('admin'), 
  async (req, res) => {
    const { data, error } = await supabase
      .from('lojistas')
      .select('*')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({ lojistas: data });
  }
);

// Aprovar lojista (apenas admin)
router.post('/:lojistaId/approve', 
  checkAuth, 
  checkRole('admin'), 
  approveLojista
);

// Rejeitar lojista (apenas admin)
router.post('/:lojistaId/reject', 
  checkAuth, 
  checkRole('admin'), 
  rejectLojista
);

module.exports = router;