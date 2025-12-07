// api-backend/controllers/approvalController.js

const axios = require('axios');
const supabase = require('../utils/supabaseClient');

// 1. Pega token de gerenciamento do Auth0
async function getAuth0ManagementToken() {
  const response = await axios.post(
    `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    {
      client_id: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
      client_secret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
      audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
      grant_type: 'client_credentials'
    }
  );
  
  return response.data.access_token;
}

// 2. Cria usuário no Auth0
async function createAuth0User(email, userData) {
  const token = await getAuth0ManagementToken();
  
  const response = await axios.post(
    `https://${process.env.AUTH0_DOMAIN}/api/v2/users`,
    {
      email: email,
      email_verified: false,
      user_metadata: {
        cnpj: userData.cnpj,
        nome_loja: userData.nome,
        telefone: userData.telefone
      },
      app_metadata: {
        role: 'lojista',
        status: 'ativo'
      },
      connection: 'Username-Password-Authentication',
      verify_email: true // Envia email de verificação
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data.user_id; // Exemplo: auth0|123456789
}

// 3. Aprova o lojista
async function approveLojista(req, res) {
  try {
    const { lojistaId } = req.params;
    
    // Busca os dados do lojista
    const { data: lojista, error } = await supabase
      .from('lojistas')
      .select('*')
      .eq('id', lojistaId)
      .single();
    
    if (error || !lojista) {
      return res.status(404).json({ error: 'Lojista não encontrado' });
    }
    
    // Cria usuário no Auth0
    const auth0Id = await createAuth0User(lojista.email, {
      cnpj: lojista.cnpj,
      nome: lojista.nome,
      telefone: lojista.telefone
    });
    
    // Atualiza o Supabase com o auth0_id e status "aprovado"
    await supabase
      .from('lojistas')
      .update({
        status: 'aprovado',
        auth0_id: auth0Id,
        data_aprovacao: new Date().toISOString()
      })
      .eq('id', lojistaId);
    
    res.json({
      success: true,
      message: 'Lojista aprovado! Email de boas-vindas enviado.',
      auth0Id: auth0Id
    });
    
  } catch (error) {
    console.error('Erro ao aprovar lojista:', error);
    res.status(500).json({ error: 'Erro ao aprovar lojista' });
  }
}

// 4. Rejeita o lojista
async function rejectLojista(req, res) {
  try {
    const { lojistaId } = req.params;
    const { motivo } = req.body;
    
    // Atualiza status no Supabase
    await supabase
      .from('lojistas')
      .update({
        status: 'rejeitado',
        motivo_rejeicao: motivo,
        data_rejeicao: new Date().toISOString()
      })
      .eq('id', lojistaId);
    
    // TODO: Enviar email informando a rejeição
    
    res.json({
      success: true,
      message: 'Lojista rejeitado.'
    });
    
  } catch (error) {
    console.error('Erro ao rejeitar lojista:', error);
    res.status(500).json({ error: 'Erro ao rejeitar lojista' });
  }
}

module.exports = {
  approveLojista,
  rejectLojista
};