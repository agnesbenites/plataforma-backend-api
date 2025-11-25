require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('=== TESTE COMPLETO DE CONEXÃO ===\n');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testarTabelas() {
  const tabelas = [
    'lojistas', 
    'consultores', 
    'produtos', 
    'aprovacoes_consultores',
    'vendas'
  ];

  console.log('Testando conexão com as tabelas:\n');

  for (const tabela of tabelas) {
    try {
      const { data, error, count } = await supabase
        .from(tabela)
        .select('*', { count: 'exact' })
        .limit(1);

      if (error) {
        console.log(`❌ ${tabela}: ERRO - ${error.message}`);
      } else {
        const colunas = data && data.length > 0 ? Object.keys(data[0]) : [];
        console.log(`✅ ${tabela}: OK (${count} registros)`);
        console.log(`   Colunas:`, colunas.join(', '));
      }
    } catch (e) {
      console.log(`❌ ${tabela}: ERRO CRÍTICO - ${e.message}`);
    }
  }
}

testarTabelas();