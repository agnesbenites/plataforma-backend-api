const { createClient } = require('@supabase/supabase-js');

console.log('🌐 Testando conectividade de rede...');

// Configuração do Supabase
const supabaseUrl = 'https://vluxffbornrlxcepqnzr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsdXhmZmJvcm5ybHhjZXBxbXpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTk2MzA2NiwiZXhwIjoyMDc3MzIzMDY2fQ.rBovfjyawq27VtBrOCxo5eGHhmTegUWaqQOFVskk8A0';

console.log('URL:', supabaseUrl);
console.log('Chave existe?', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

async function testarConexao() {
  try {
    console.log('🔄 Tentando conectar ao Supabase...');
    
    // Teste mais simples possível
    const { data, error } = await supabase
      .from('lojistas')
      .select('*')
      .limit(1)
      .maybeSingle(); // Não dá erro se não encontrar

    if (error) {
      console.log('❌ Erro do Supabase:', error);
      console.log('💡 Código:', error.code);
      console.log('📝 Mensagem:', error.message);
      console.log('🔍 Detalhes:', error.details);
    } else {
      console.log('✅ Conexão bem-sucedida!');
      console.log('📦 Dados recebidos:', data);
    }
    
  } catch (err) {
    console.log('💥 ERRO CRÍTICO:', err.message);
    console.log('🔧 Stack:', err.stack);
    
    // Verificar tipo específico de erro
    if (err.message.includes('fetch failed')) {
      console.log('🚨 Problema de rede detectado!');
      console.log('💡 Possíveis causas:');
      console.log('   - Firewall bloqueando conexões');
      console.log('   - Proxy corporativo');
      console.log('   - Antivírus interferindo');
      console.log('   - Problemas de DNS');
    }
  }
}

testarConexao();