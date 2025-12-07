// api-backend/routes/lojistaRoutes.js

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // ← ADICIONAR
const supabase = require('../utils/supabaseClient');

// Importar o NOVO Controller (se você tiver)
// const stripeController = require('../controllers/stripeController'); 

// Importar o middleware de autenticação (se você tiver)
// const authMiddleware = require('../middlewares/authMiddleware'); 

/**
 * ROTA DE TESTE
 * GET /api/lojistas
 */
router.get("/", (req, res) => {
  res.json({ 
    message: "API de Lojistas funcionando! ✅",
    endpoints: [
      "POST /api/lojistas/register - Registrar novo lojista",
      "GET /api/lojistas/:id - Buscar dados do lojista",
      "GET /api/lojistas/list/all - Listar todos os lojistas",
    ]
  });
});

/**
 * 🆕 REGISTRAR NOVO LOJISTA
 * POST /api/lojistas/register
 */
router.post('/register', async (req, res) => {
  try {
    const {
      nome_fantasia,
      razao_social,
      cnpj,
      email,
      telefone,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      default_commission_rate,
    } = req.body;

    console.log('🏪 Registrando novo lojista:', nome_fantasia);

    // Validações básicas
    if (!nome_fantasia || !email || !cnpj) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios faltando: nome_fantasia, email, cnpj',
      });
    }

    // Verificar se CNPJ já existe
    const { data: existingCNPJ, error: cnpjError } = await supabase
      .from('lojistas')
      .select('id')
      .eq('cnpj', cnpj)
      .maybeSingle();

    if (cnpjError && cnpjError.code !== 'PGRST116') {
      console.error('❌ Erro ao verificar CNPJ:', cnpjError);
      throw cnpjError;
    }

    if (existingCNPJ) {
      return res.status(400).json({
        success: false,
        error: 'CNPJ já cadastrado no sistema',
      });
    }

    // Verificar se email já existe
    const { data: existingEmail, error: emailError } = await supabase
      .from('lojistas')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (emailError && emailError.code !== 'PGRST116') {
      console.error('❌ Erro ao verificar email:', emailError);
      throw emailError;
    }

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email já cadastrado no sistema',
      });
    }

    // 🆕 CRIAR CONTA STRIPE CONNECT PARA O LOJISTA
    console.log('🔄 Criando conta Stripe Connect para o lojista...');
    
    let stripeAccountId = null;
    let onboardingUrl = null;

    try {
      const stripeAccount = await stripe.accounts.create({
        type: 'express',
        country: 'BR',
        email: email,
        business_profile: {
          name: nome_fantasia,
          product_description: 'Lojista - Vendedor de produtos',
        },
        metadata: {
          tipo: 'lojista', // ← IDENTIFICA COMO LOJISTA
          nome_fantasia: nome_fantasia,
          razao_social: razao_social || '',
          cnpj: cnpj,
          email: email,
          lojista_db_id: 'pendente', // Será atualizado depois
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      stripeAccountId = stripeAccount.id;
      console.log(`✅ Conta Stripe criada: ${stripeAccountId}`);

      // Criar link de onboarding
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${process.env.FRONTEND_URL}/lojista/onboarding/refresh`,
        return_url: `${process.env.FRONTEND_URL}/lojista/onboarding/success`,
        type: 'account_onboarding',
      });

      onboardingUrl = accountLink.url;
      console.log(`✅ Link de onboarding criado`);

    } catch (stripeError) {
      console.error('⚠️ Erro ao criar conta Stripe (continuando sem Stripe):', stripeError.message);
      // Continua o cadastro mesmo se o Stripe falhar
    }

    // Inserir lojista no banco
    const { data, error } = await supabase
      .from('lojistas')
      .insert({
        nome_fantasia: nome_fantasia,
        razao_social: razao_social || null,
        cnpj: cnpj,
        email: email,
        telefone: telefone || null,
        // Endereço
        cep: cep || null,
        endereco: endereco || null,
        numero: numero || null,
        complemento: complemento || null,
        bairro: bairro || null,
        cidade: cidade || null,
        estado: estado || null,
        // Comissão
        default_commission_rate: default_commission_rate || 10,
        // Stripe
        stripe_account_id: stripeAccountId, // ← SALVA O ID DA CONTA STRIPE
        stripe_account_status: stripeAccountId ? 'pending' : null,
        stripe_onboarding_complete: false,
        // Timestamps (se sua tabela tiver)
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao inserir lojista:', error);
      
      // Se salvou no Stripe mas falhou no DB, deletar conta Stripe
      if (stripeAccountId) {
        console.log('🔄 Deletando conta Stripe órfã...');
        await stripe.accounts.del(stripeAccountId);
      }
      
      throw error;
    }

    // 🆕 ATUALIZAR METADATA DO STRIPE COM O ID DO BANCO
    if (stripeAccountId) {
      await stripe.accounts.update(stripeAccountId, {
        metadata: {
          tipo: 'lojista',
          nome_fantasia: nome_fantasia,
          razao_social: razao_social || '',
          cnpj: cnpj,
          email: email,
          lojista_db_id: data.id.toString(), // ← ATUALIZA COM O ID REAL
        },
      });
    }

    console.log('✅ Lojista registrado com ID:', data.id);

    return res.status(201).json({
      success: true,
      lojistaId: data.id,
      message: 'Lojista registrado com sucesso!',
      stripe_account_id: stripeAccountId,
      onboarding_url: onboardingUrl, // ← RETORNA URL DE ONBOARDING
    });

  } catch (error) {
    console.error('❌ Erro ao registrar lojista:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao registrar lojista',
    });
  }
});

/**
 * BUSCAR DADOS DO LOJISTA
 * GET /api/lojistas/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔍 Buscando lojista:', id);

    const { data, error } = await supabase
      .from('lojistas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar lojista:', error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Lojista não encontrado',
      });
    }

    console.log('✅ Lojista encontrado:', data.nome_fantasia);

    // 🆕 BUSCAR STATUS DA CONTA STRIPE
    let stripeStatus = null;
    if (data.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(data.stripe_account_id);
        stripeStatus = {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          tipo: account.metadata?.tipo || 'lojista',
        };
      } catch (stripeError) {
        console.error('⚠️ Erro ao buscar conta Stripe:', stripeError.message);
      }
    }

    return res.status(200).json({
      success: true,
      lojista: {
        ...data,
        stripe_status: stripeStatus, // ← ADICIONA STATUS DO STRIPE
      },
    });

  } catch (error) {
    console.error('❌ Erro ao buscar lojista:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao buscar lojista',
    });
  }
});

/**
 * 🆕 CRIAR NOVO LINK DE ONBOARDING (se o link expirou)
 * POST /api/lojistas/:id/onboarding-link
 */
router.post('/:id/onboarding-link', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔄 Criando novo link de onboarding para lojista:', id);

    const { data: lojista, error } = await supabase
      .from('lojistas')
      .select('stripe_account_id, nome_fantasia, email')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!lojista) {
      return res.status(404).json({
        success: false,
        error: 'Lojista não encontrado',
      });
    }

    if (!lojista.stripe_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Lojista não possui conta Stripe. Crie uma primeiro.',
      });
    }

    // Criar novo link de onboarding
    const accountLink = await stripe.accountLinks.create({
      account: lojista.stripe_account_id,
      refresh_url: `${process.env.FRONTEND_URL}/lojista/onboarding/refresh`,
      return_url: `${process.env.FRONTEND_URL}/lojista/onboarding/success`,
      type: 'account_onboarding',
    });

    console.log('✅ Novo link de onboarding criado');

    return res.status(200).json({
      success: true,
      onboarding_url: accountLink.url,
      message: 'Link de onboarding criado com sucesso!',
    });

  } catch (error) {
    console.error('❌ Erro ao criar link de onboarding:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * ATUALIZAR DADOS DO LOJISTA
 * PUT /api/lojistas/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log('🔄 Atualizando lojista:', id);

    // Remover campos que não devem ser atualizados diretamente
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.stripe_account_id;

    // Adicionar timestamp de atualização
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('lojistas')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar lojista:', error);
      throw error;
    }

    console.log('✅ Lojista atualizado:', data.nome_fantasia);

    return res.status(200).json({
      success: true,
      lojista: data,
      message: 'Lojista atualizado com sucesso!',
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar lojista:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao atualizar lojista',
    });
  }
});

/**
 * LISTAR TODOS OS LOJISTAS (COM FILTROS OPCIONAIS)
 * GET /api/lojistas/list/all
 */
router.get('/list/all', async (req, res) => {
  try {
    const { stripe_status } = req.query;

    console.log('📋 Listando lojistas...');

    let query = supabase.from('lojistas').select('*');

    // Filtros opcionais
    if (stripe_status) {
      query = query.eq('stripe_account_status', stripe_status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao listar lojistas:', error);
      throw error;
    }

    console.log(`✅ ${data.length} lojistas encontrados`);

    return res.status(200).json({
      success: true,
      lojistas: data,
      count: data.length,
    });

  } catch (error) {
    console.error('❌ Erro ao listar lojistas:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao listar lojistas',
    });
  }
});

/**
 * ROTA PARA DADOS DE PAGAMENTO (se você tiver controller específico)
 * GET /api/lojista/dados-pagamento
 */
// router.get(
//     '/dados-pagamento', 
//     authMiddleware.checkAuth,
//     stripeController.getDadosPagamentoLojista
// );

module.exports = router;