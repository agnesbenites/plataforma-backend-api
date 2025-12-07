// api-backend/utils/auth0Management.js

const axios = require('axios');

/**
 * Pega token de gerenciamento do Auth0
 * Necessário para gerenciar usuários via API
 */
async function getAuth0ManagementToken() {
  try {
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
  } catch (error) {
    console.error('❌ Erro ao obter token de gerenciamento:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Bloqueia um usuário no Auth0
 * @param {string} auth0Id - ID do usuário no Auth0 (ex: auth0|123456)
 * @param {string} reason - Motivo do bloqueio
 */
async function blockUserInAuth0(auth0Id, reason = 'Falta de pagamento') {
  try {
    console.log(`🔒 Tentando bloquear usuário ${auth0Id}...`);
    
    const token = await getAuth0ManagementToken();
    
    const response = await axios.patch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}`,
      {
        blocked: true,
        app_metadata: {
          blocked_reason: reason,
          blocked_at: new Date().toISOString(),
          blocked_by: 'system'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Usuário ${auth0Id} bloqueado com sucesso no Auth0`);
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro ao bloquear usuário no Auth0:', {
      auth0Id,
      error: error.response?.data || error.message,
      status: error.response?.status
    });
    
    // Se o erro for 404 (usuário não encontrado), não propaga o erro
    if (error.response?.status === 404) {
      console.warn('⚠️ Usuário não encontrado no Auth0, pulando bloqueio');
      return null;
    }
    
    throw error;
  }
}

/**
 * Desbloqueia um usuário no Auth0
 * @param {string} auth0Id - ID do usuário no Auth0
 */
async function unblockUserInAuth0(auth0Id) {
  try {
    console.log(`🔓 Tentando desbloquear usuário ${auth0Id}...`);
    
    const token = await getAuth0ManagementToken();
    
    const response = await axios.patch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}`,
      {
        blocked: false,
        app_metadata: {
          blocked_reason: null,
          blocked_at: null,
          unblocked_at: new Date().toISOString(),
          unblocked_by: 'system'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Usuário ${auth0Id} desbloqueado com sucesso no Auth0`);
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro ao desbloquear usuário no Auth0:', {
      auth0Id,
      error: error.response?.data || error.message,
      status: error.response?.status
    });
    
    // Se o erro for 404, não propaga
    if (error.response?.status === 404) {
      console.warn('⚠️ Usuário não encontrado no Auth0, pulando desbloqueio');
      return null;
    }
    
    throw error;
  }
}

/**
 * Busca informações de um usuário no Auth0
 * @param {string} auth0Id - ID do usuário no Auth0
 */
async function getAuth0User(auth0Id) {
  try {
    const token = await getAuth0ManagementToken();
    
    const response = await axios.get(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('❌ Erro ao buscar usuário no Auth0:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Cria um novo usuário no Auth0 (usado na aprovação de lojistas)
 * @param {string} email - Email do usuário
 * @param {object} userData - Dados adicionais do usuário
 */
async function createAuth0User(email, userData = {}) {
  try {
    console.log(`👤 Criando usuário no Auth0: ${email}`);
    
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
          role: userData.role || 'lojista',
          status: 'ativo',
          created_by: 'system'
        },
        connection: 'Username-Password-Authentication',
        verify_email: true // Envia email de verificação automaticamente
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Usuário criado no Auth0: ${response.data.user_id}`);
    return response.data;
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário no Auth0:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Atribui uma role a um usuário no Auth0
 * @param {string} auth0Id - ID do usuário no Auth0
 * @param {string} roleId - ID da role no Auth0
 */
async function assignRoleToUser(auth0Id, roleId) {
  try {
    console.log(`🔐 Atribuindo role ao usuário ${auth0Id}`);
    
    const token = await getAuth0ManagementToken();
    
    await axios.post(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}/roles`,
      {
        roles: [roleId]
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Role atribuída com sucesso`);
    
  } catch (error) {
    console.error('❌ Erro ao atribuir role:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  blockUserInAuth0,
  unblockUserInAuth0,
  getAuth0User,
  getAuth0ManagementToken,
  createAuth0User,
  assignRoleToUser
};