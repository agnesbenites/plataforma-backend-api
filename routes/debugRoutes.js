// backend/routes/debugRoutes.js
const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');

// ============================================
// ROTA: LISTAR TODAS AS TABELAS E ESTRUTURA
// ============================================
router.get('/estrutura-banco', async (req, res) => {
  try {
    // Query para listar todas as tabelas e suas colunas
    const { data: tabelas, error } = await supabase
      .rpc('get_table_structure');

    if (error) {
      // Se a função não existir, usar query SQL direta
      const { data: tabelasDireto, error: erroSQL } = await supabase
        .from('information_schema.tables')
        .select('*')
        .eq('table_schema', 'public');

      if (erroSQL) {
        // Última tentativa: listar tabelas conhecidas
        const tabelasConhecidas = [
          'usuarios', 'lojistas', 'consultores', 'produtos', 
          'vendas', 'aprovacoes_consultores'
        ];

        let estrutura = {};

        for (const tabela of tabelasConhecidas) {
          try {
            // Tentar fazer um select vazio só para ver a estrutura
            const { data, error: selectError } = await supabase
              .from(tabela)
              .select('*')
              .limit(0);

            if (!selectError) {
              estrutura[tabela] = {
                existe: true,
                mensagem: 'Tabela encontrada'
              };
            }
          } catch (e) {
            estrutura[tabela] = {
              existe: false,
              mensagem: 'Tabela não encontrada'
            };
          }
        }

        return res.json({
          success: true,
          metodo: 'teste_manual',
          estrutura: estrutura,
          instrucoes: 'Execute o SQL abaixo no Supabase SQL Editor para ver a estrutura completa'
        });
      }

      return res.json({
        success: true,
        tabelas: tabelasDireto
      });
    }

    res.json({
      success: true,
      tabelas: tabelas
    });

  } catch (error) {
    console.error('Erro ao buscar estrutura:', error);
    res.status(500).json({ 
      error: error.message,
      sqlParaExecutar: `
-- EXECUTE ESTE SQL NO SUPABASE SQL EDITOR:

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public'
    AND table_name IN ('usuarios', 'lojistas', 'consultores', 'produtos', 'vendas', 'aprovacoes_consultores')
ORDER BY 
    table_name, ordinal_position;

-- E também execute:

SELECT
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE 
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public';
      `
    });
  }
});

// ============================================
// ROTA: TESTAR TABELAS ESPECÍFICAS
// ============================================
router.get('/verificar-tabela/:nomeTabela', async (req, res) => {
  try {
    const { nomeTabela } = req.params;

    // Tentar select vazio
    const { data, error, count } = await supabase
      .from(nomeTabela)
      .select('*', { count: 'exact', head: false })
      .limit(5);

    if (error) {
      return res.json({
        success: false,
        tabela: nomeTabela,
        existe: false,
        erro: error.message
      });
    }

    // Pegar os nomes das colunas
    const colunas = data && data.length > 0 ? Object.keys(data[0]) : [];

    res.json({
      success: true,
      tabela: nomeTabela,
      existe: true,
      totalRegistros: count,
      colunas: colunas,
      amostra: data
    });

  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      tabela: req.params.nomeTabela
    });
  }
});

// ============================================
// ROTA: LISTAR TODAS AS TABELAS PÚBLICAS
// ============================================
router.get('/listar-tabelas', async (req, res) => {
  try {
    const tabelasParaTestar = [
      'usuarios',
      'lojistas', 
      'consultores',
      'produtos',
      'vendas',
      'aprovacoes_consultores',
      'categorias',
      'vendedores'
    ];

    let resultado = {};

    for (const tabela of tabelasParaTestar) {
      try {
        const { data, error, count } = await supabase
          .from(tabela)
          .select('*', { count: 'exact' })
          .limit(1);

        if (error) {
          resultado[tabela] = {
            existe: false,
            erro: error.message
          };
        } else {
          const colunas = data && data.length > 0 ? Object.keys(data[0]) : [];
          resultado[tabela] = {
            existe: true,
            totalRegistros: count,
            colunas: colunas
          };
        }
      } catch (e) {
        resultado[tabela] = {
          existe: false,
          erro: e.message
        };
      }
    }

    res.json({
      success: true,
      tabelas: resultado
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;