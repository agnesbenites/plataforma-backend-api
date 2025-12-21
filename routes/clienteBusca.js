// routes/clienteBusca.js
// Rotas de busca de produtos e lojas (Mobile)

const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');

// ========== FUNÇÕES AUXILIARES ==========

// Função para calcular distância entre dois pontos (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distância em km
}

// Obter raio máximo baseado no plano
function obterRaioMaximo(plano) {
  const raios = {
    basico: 5,
    basic: 5,
    pro: 10,
    enterprise: 20
  };
  return raios[plano?.toLowerCase()] || 5;
}

// ========== ROTAS ==========

// 🔍 POST /api/cliente/buscar-produtos
router.post('/buscar-produtos', async (req, res) => {
  try {
    const { query, localizacao } = req.body;

    if (!query || !localizacao) {
      return res.status(400).json({
        message: 'Query e localização são obrigatórios'
      });
    }

    const { latitude, longitude } = localizacao;

    // 1. Buscar todas as lojas ativas com seus planos
    const { data: lojasData, error: lojasError } = await supabase
      .from('lojistas')
      .select(`
        id,
        nome,
        endereco,
        latitude,
        longitude,
        plano,
        telefone,
        horario_funcionamento,
        opcao_entrega,
        opcao_retirada,
        aberta
      `)
      .eq('ativo', true);

    if (lojasError) {
      console.error('❌ Erro ao buscar lojas:', lojasError);
      return res.status(500).json({ message: 'Erro ao buscar lojas' });
    }

    // 2. Calcular distâncias e filtrar por raio do plano
    const lojasProximas = lojasData
      .map(loja => {
        const distancia = calcularDistancia(
          latitude,
          longitude,
          parseFloat(loja.latitude),
          parseFloat(loja.longitude)
        );

        const raioMaximo = obterRaioMaximo(loja.plano);

        return {
          ...loja,
          distancia,
          raioMaximo,
          dentroDoRaio: distancia <= raioMaximo
        };
      })
      .filter(loja => loja.dentroDoRaio)
      .sort((a, b) => {
        const prioridadePlano = {
          enterprise: 3,
          pro: 2,
          basico: 1,
          basic: 1
        };

        const prioridadeA = prioridadePlano[a.plano?.toLowerCase()] || 1;
        const prioridadeB = prioridadePlano[b.plano?.toLowerCase()] || 1;

        if (prioridadeA !== prioridadeB) {
          return prioridadeB - prioridadeA;
        }

        return a.distancia - b.distancia;
      });

    if (lojasProximas.length === 0) {
      return res.json({
        semResultados: true,
        message: 'Nenhuma loja encontrada próxima a você',
        produtos: [],
        lojas: []
      });
    }

    // 3. Buscar produtos nessas lojas
    const idsLojas = lojasProximas.map(l => l.id);
    const termosBusca = query.toLowerCase().split(' ').filter(t => t.length > 2);

    const { data: produtosData, error: produtosError } = await supabase
      .from('produtos')
      .select(`
        id,
        nome,
        descricao,
        preco,
        imagem,
        disponibilidade,
        tags,
        tamanhos_disponiveis,
        quantidade_estoque,
        loja_id
      `)
      .in('loja_id', idsLojas)
      .eq('ativo', true)
      .gt('quantidade_estoque', 0);

    if (produtosError) {
      console.error('❌ Erro ao buscar produtos:', produtosError);
      return res.status(500).json({ message: 'Erro ao buscar produtos' });
    }

    const produtosFiltrados = produtosData.filter(produto => {
      const textoCompleto = `
        ${produto.nome}
        ${produto.descricao}
        ${produto.tags?.join(' ') || ''}
      `.toLowerCase();

      return termosBusca.some(termo => textoCompleto.includes(termo));
    });

    const produtosEnriquecidos = produtosFiltrados.map(produto => {
      const loja = lojasProximas.find(l => l.id === produto.loja_id);

      return {
        ...produto,
        loja_nome: loja?.nome,
        loja_plano: loja?.plano,
        distancia: loja?.distancia,
        loja_endereco: loja?.endereco,
        loja_telefone: loja?.telefone,
        loja_horario: loja?.horario_funcionamento,
        loja_entrega: loja?.opcao_entrega,
        loja_retirada: loja?.opcao_retirada,
        loja_aberta: loja?.aberta
      };
    });

    const produtosOrdenados = produtosEnriquecidos.sort((a, b) => {
      if (a.disponibilidade !== b.disponibilidade) {
        return b.disponibilidade - a.disponibilidade;
      }
      return a.distancia - b.distancia;
    });

    const lojasEnriquecidas = lojasProximas.map(loja => {
      const produtosEncontrados = produtosEnriquecidos.filter(
        p => p.loja_id === loja.id
      ).length;

      return {
        ...loja,
        produtos_encontrados: produtosEncontrados
      };
    }).filter(loja => loja.produtos_encontrados > 0);

    console.log(`✅ Busca: "${query}" - ${produtosOrdenados.length} produtos em ${lojasEnriquecidas.length} lojas`);

    res.json({
      produtos: produtosOrdenados,
      lojas: lojasEnriquecidas,
      totalProdutos: produtosOrdenados.length,
      totalLojas: lojasEnriquecidas.length,
      semResultados: produtosOrdenados.length === 0,
      filtros: {
        query,
        raios: {
          basico: '5km',
          pro: '10km',
          enterprise: '20km'
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar produtos:', error);
    res.status(500).json({ message: 'Erro ao buscar produtos' });
  }
});

// 📦 GET /api/cliente/produto/:id
router.get('/produto/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: produto, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !produto) {
      console.error('❌ Produto não encontrado:', error);
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    const { data: loja } = await supabase
      .from('lojistas')
      .select('*')
      .eq('id', produto.loja_id)
      .single();

    const produtoCompleto = {
      ...produto,
      lojistas: loja
    };

    console.log(`✅ Produto consultado: ${produto.nome}`);

    res.json({ produto: produtoCompleto });

  } catch (error) {
    console.error('❌ Erro ao buscar produto:', error);
    res.status(500).json({ message: 'Erro ao buscar produto' });
  }
});

// 🏪 GET /api/cliente/loja/:id
router.get('/loja/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: loja, error: lojaError } = await supabase
      .from('lojistas')
      .select('*')
      .eq('id', id)
      .single();

    if (lojaError || !loja) {
      return res.status(404).json({ message: 'Loja não encontrada' });
    }

    const { data: produtos, error: produtosError } = await supabase
      .from('produtos')
      .select('*')
      .eq('loja_id', id)
      .eq('ativo', true)
      .gt('quantidade_estoque', 0)
      .order('nome');

    console.log(`✅ Loja consultada: ${loja.nome}`);

    res.json({
      loja,
      produtos: produtos || []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar loja:', error);
    res.status(500).json({ message: 'Erro ao buscar loja' });
  }
});

// 🏷️ GET /api/cliente/categorias
// Buscar todas as categorias
router.get('/categorias', async (req, res) => {
  try {
    const { data: categorias, error } = await supabase
      .from('categorias')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar categorias:', error);
      return res.status(500).json({ message: 'Erro ao buscar categorias' });
    }

    console.log(`✅ ${categorias.length} categorias encontradas`);

    res.json({
      categorias,
      total: categorias.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar categorias:', error);
    res.status(500).json({ message: 'Erro ao buscar categorias' });
  }
});

// 📦 GET /api/cliente/produtos-por-categoria/:categoriaId
// Buscar produtos de uma categoria específica
router.get('/produtos-por-categoria/:categoriaId', async (req, res) => {
  try {
    const { categoriaId } = req.params;
    const { latitude, longitude, raio = 10 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Localização é obrigatória' });
    }

    const { data: produtos, error } = await supabase
      .from('produtos')
      .select(`
        *,
        lojistas:loja_id (
          id,
          nome,
          nome_fantasia,
          latitude,
          longitude,
          endereco
        )
      `)
      .eq('categoria_id', categoriaId)
      .eq('disponivel', true);

    if (error) {
      console.error('❌ Erro ao buscar produtos:', error);
      return res.status(500).json({ message: 'Erro ao buscar produtos' });
    }

    const produtosFiltrados = produtos
      .map(produto => {
        if (!produto.lojistas?.latitude || !produto.lojistas?.longitude) {
          return null;
        }

        const distancia = calcularDistancia(
          parseFloat(latitude),
          parseFloat(longitude),
          parseFloat(produto.lojistas.latitude),
          parseFloat(produto.lojistas.longitude)
        );

        if (distancia <= raio) {
          return {
            ...produto,
            loja_nome: produto.lojistas.nome_fantasia || produto.lojistas.nome,
            distancia_km: parseFloat(distancia.toFixed(1))
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.distancia_km - b.distancia_km);

    console.log(`✅ ${produtosFiltrados.length} produtos encontrados na categoria ${categoriaId}`);

    res.json({
      produtos: produtosFiltrados,
      total: produtosFiltrados.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar produtos por categoria:', error);
    res.status(500).json({ message: 'Erro ao buscar produtos' });
  }
});

// 🛒 GET /api/cliente/carrinho
router.get('/carrinho', async (req, res) => {
  try {
    res.json({
      itens: [],
      totalItens: 0
    });
  } catch (error) {
    console.error('❌ Erro ao buscar carrinho:', error);
    res.status(500).json({ message: 'Erro ao buscar carrinho' });
  }
});

// 📜 GET /api/cliente/historico/compras
router.get('/historico/compras', async (req, res) => {
  try {
    res.json({ compras: [] });
  } catch (error) {
    console.error('❌ Erro ao buscar histórico:', error);
    res.status(500).json({ message: 'Erro ao buscar histórico' });
  }
});

// 💬 GET /api/cliente/historico/conversas
router.get('/historico/conversas', async (req, res) => {
  try {
    res.json({ conversas: [] });
  } catch (error) {
    console.error('❌ Erro ao buscar conversas:', error);
    res.status(500).json({ message: 'Erro ao buscar conversas' });
  }
});

module.exports = router;