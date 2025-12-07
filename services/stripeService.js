// services/stripeService.js

// Importa a biblioteca do Stripe e carrega a chave secreta do ambiente
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 

/**
 * Cria uma Conta Express e gera o link de onboarding para o parceiro.
 * @param {string} email_do_parceiro - Email do Lojista ou Consultor.
 * @param {string} tipo_de_parceiro - 'lojista' ou 'consultor'.
 * @param {string} frontend_base_url - URL base do seu frontend (para redirecionamentos).
 * @returns {object} Um objeto contendo o ID da conta e o URL de onboarding.
 */
async function criarContaEOnboard(email_do_parceiro, tipo_de_parceiro, frontend_base_url) {
  try {
    // 1. Cria a Conta Conectada
    const account = await stripe.accounts.create({
      type: 'express', 
      country: 'BR', // Importante para o Brasil
      email: email_do_parceiro,
      capabilities: {
        card_payments: { requested: true }, 
        transfers: { requested: true }, // Fundamental para fazer o repasse
      },
      business_type: 'individual', // Sugestão para MVP, pode ser alterado para 'company'
      metadata: {
        parceiro_tipo: tipo_de_parceiro,
        // Adicione o ID do usuário do seu DB/Auth0 aqui, se disponível
      },
    });

    // 2. Gera o Link de Onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      // Usamos a URL base do frontend para montar o retorno
      refresh_url: `${frontend_base_url}/settings/payments?status=falha`, 
      return_url: `${frontend_base_url}/settings/payments?status=concluido`, 
      type: 'account_onboarding',
    });

    return { 
      accountId: account.id, 
      url: accountLink.url 
    };

  } catch (error) {
    console.error("Erro ao criar conta Stripe:", error);
    throw new Error('Falha na conexão com o Stripe.');
  }
}

module.exports = {
  criarContaEOnboard,
  // Aqui virão outras funções, como fazerRepasse()
};