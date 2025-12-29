// backend/routes/search.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Busca inteligente
router.post('/buscar-inteligente', async (req, res) => {
  try {
    const { query, latitude, longitude, distanciaMaxima = 50 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query é obrigatória' });
    }

    // 1. Expande a query usando sinônimos
    const expandedQuery = await expandirQuery(query);
    
    // 2. Busca produtos com a função PostgreSQL
    const { data: produtos, error } = await supabase.rpc(
      'buscar_produtos_inteligente',
      {
        query_text: query,
        user_lat: latitude,
        user_lng: longitude,
        max_distance: distanciaMaxima,
        limit_results: 50
      }
    );

    if (error) throw error;

    // 3. Agrupa por loja
    const lojasMap = new Map();
    produtos.forEach(produto => {
      if (!lojasMap.has(produto.loja_id)) {
        lojasMap.set(produto.loja_id, {
          id: produto.loja_id,
          nome: produto.loja_nome,
          logo: produto.loja_logo,
          distancia_km: produto.distancia_km,
          produtos_encontrados: 0,
          produtos: []
        });
      }
      const loja = lojasMap.get(produto.loja_id);
      loja.produtos_encontrados++;
      loja.produtos.push(produto);
    });

    const resultado = {
      query_original: query,
      query_expandida: expandedQuery,
      total_produtos: produtos.length,
      total_lojas: lojasMap.size,
      produtos: produtos,
      lojas: Array.from(lojasMap.values())
    };

    res.json(resultado);

  } catch (error) {
    console.error('Erro na busca inteligente:', error);
    res.status(500).json({ 
      error: 'Erro na busca',
      message: error.message 
    });
  }
});

// Função para expandir query com sinônimos
async function expandirQuery(query) {
  const termos = query.toLowerCase().split(' ');
  const termosExpandidos = new Set(termos);
  
  for (const termo of termos) {
    // Busca sinônimos no banco
    const { data: sinonimos } = await supabase
      .from('produtos_sinonimos')
      .select('sinonimo')
      .or(`termo_principal.eq.${termo},sinonimo.eq.${termo}`);
    
    if (sinonimos) {
      sinonimos.forEach(s => termosExpandidos.add(s.sinonimo));
    }
    
    // Aplica stemming simples
    const raiz = aplicarStemming(termo);
    if (raiz !== termo) {
      termosExpandidos.add(raiz);
    }
  }
  
  return Array.from(termosExpandidos);
}

// Stemming simples para português
function aplicarStemming(palavra) {
  const sufixos = [
    'inha', 'inho', 'zinha', 'zinho', 'ita', 'ito',
    'ão', 'ona', 'zão', 'zona',
    's', 'es', 'a', 'o'
  ];
  
  for (const sufixo of sufixos) {
    if (palavra.endsWith(sufixo)) {
      return palavra.slice(0, -sufixo.length);
    }
  }
  
  return palavra;
}

// Endpoint para atualizar sinônimos
router.post('/sinonimos', async (req, res) => {
  try {
    const { termo_principal, sinonimos } = req.body;
    
    const inserts = sinonimos.map(sinonimo => ({
      termo_principal,
      sinonimo,
      categoria: req.body.categoria || 'geral'
    }));
    
    const { data, error } = await supabase
      .from('produtos_sinonimos')
      .upsert(inserts, { onConflict: 'termo_principal,sinonimo' });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: `Sinônimos adicionados para "${termo_principal}"` 
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;