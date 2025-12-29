// backend/routes/learning.js
router.post('/aprender-sinonimo', async (req, res) => {
  try {
    const { query_original, query_corrigida, produto_id } = req.body;
    
    // Extrai termos diferentes
    const termosOriginais = query_original.toLowerCase().split(' ');
    const termosCorrigidos = query_corrigida.toLowerCase().split(' ');
    
    const novosSinonimos = [];
    
    // Compara termos
    termosOriginais.forEach((termo, index) => {
      if (termosCorrigidos[index] && termo !== termosCorrigidos[index]) {
        novosSinonimos.push({
          termo_principal: termosCorrigidos[index],
          sinonimo: termo,
          categoria: 'aprendido'
        });
      }
    });
    
    // Salva no banco
    if (novosSinonimos.length > 0) {
      await supabase
        .from('produtos_sinonimos')
        .upsert(novosSinonimos, { onConflict: 'termo_principal,sinonimo' });
    }
    
    res.json({ 
      success: true, 
      aprendido: novosSinonimos 
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});