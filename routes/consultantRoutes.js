// api-backend/routes/consultantRoutes.js

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // ← ADICIONAR
const supabase = require('../utils/supabaseClient');
const { createConnectAccount, createOnboardingLink } = require('../utils/stripeConnect');

/**
 * ROTA DE TESTE
 * GET /api/consultores
 */
router.get("/", (req, res) => {
  res.json({ 
    message: "API de Consultores funcionando! ✅",
    endpoints: [
      "POST /api/consultores/register - Registrar novo consultor",
      "GET /api/consultores/:id - Buscar dados do consultor",
      "POST /api/consultores/criar-conta - Criar conta Stripe (LEGADO)",
    ]
  });
});

/**
 * REGISTRAR NOVO CONSULTOR
 * POST /api/consultores/register
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      cpf,
      email,
      phone,
      rg,
      cep,
      address,
      number,
      complement,
      neighborhood,
      city,
      state,
      curriculum,
      bank_name,
      bank_agency,
      bank_account,
    } = req.body;

    console.log('📝 Registrando novo consultor:', email);

    // Validações básicas
    if (!name || !cpf || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios faltando: name, cpf, email, phone',
      });
    }

    // Verificar se CPF já existe
    const { data: existingCPF, error: cpfError } = await supabase
      .from('consultores')
      .select('id')
      .eq('cpf', cpf)
      .maybeSingle();

    if (cpfError && cpfError.code !== 'PGRST116') {
      console.error('❌ Erro ao verificar CPF:', cpfError);
      throw cpfError;
    }

    if (existingCPF) {
      return res.status(400).json({
        success: false,
        error: 'CPF já cadastrado no sistema',
      });
    }

    // Verificar se email já existe
    const { data: existingEmail, error: emailError } = await supabase
      .from('consultores')
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

    // 🆕 CRIAR CONTA STRIPE CONNECT PARA O CONSULTOR
    console.log('🔄 Criando conta Stripe Connect para o consultor...');
    
    let stripeAccountId = null;
    let onboardingUrl = null;

    try {
      const stripeAccount = await stripe.accounts.create({
        type: 'express',
        country: 'BR',
        email: email,
        business_profile: {
          name: `${name} - Consultor`,
          product_description: 'Consultor de vendas',
        },
        metadata: {
          tipo: 'consultor', // ← IDENTIFICA COMO CONSULTOR
          nome: name,
          email: email,
          cpf: cpf,
          consultor_db_id: 'pendente', // Será atualizado depois
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
        refresh_url: `${process.env.FRONTEND_URL}/consultor/onboarding/refresh`,
        return_url: `${process.env.FRONTEND_URL}/consultor/onboarding/success`,
        type: 'account_onboarding',
      });

      onboardingUrl = accountLink.url;
      console.log(`✅ Link de onboarding criado`);

    } catch (stripeError) {
      console.error('⚠️ Erro ao criar conta Stripe (continuando sem Stripe):', stripeError.message);
      // Continua o cadastro mesmo se o Stripe falhar
    }

    // Inserir consultor no banco
    const { data, error } = await supabase
      .from('consultores')
      .insert({
        nome: name,
        cpf: cpf,
        email: email,
        telefone: phone,
        // Endereço completo
        endereco: `${address}, ${number}${complement ? ` - ${complement}` : ''}, ${neighborhood || ''}, ${city} - ${state}, CEP: ${cep}`,
        cidade: city,
        estado: state,
        // Dados bancários (opcional no cadastro)
        banco: bank_name || null,
        agencia: bank_agency || null,
        conta: bank_account || null,
        tipo_conta: 'corrente', // Padrão
        // Status de validação
        aprovado: false, // Aguardando aprovação do admin
        cpf_validado: false,
        documento_validado: false,
        endereco_validado: false,
        banco_validado: false,
        // Stripe
        stripe_account_id: stripeAccountId, // ← SALVA O ID DA CONTA STRIPE
        stripe_account_status: stripeAccountId ? 'pending' : null,
        stripe_onboarding_complete: false,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        // Timestamps
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao inserir consultor:', error);
      
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
          tipo: 'consultor',
          nome: name,
          email: email,
          cpf: cpf,
          consultor_db_id: data.id.toString(), // ← ATUALIZA COM O ID REAL
        },
      });
    }

    console.log('✅ Consultor registrado com ID:', data.id);

    return res.status(201).json({
      success: true,
      consultorId: data.id,
      message: 'Consultor registrado com sucesso! Aguardando aprovação.',
      stripe_account_id: stripeAccountId,
      onboarding_url: onboardingUrl, // ← RETORNA URL DE ONBOARDING
    });

  } catch (error) {
    console.error('❌ Erro ao registrar consultor:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao registrar consultor',
    });
  }
});

/**
 * BUSCAR DADOS DO CONSULTOR
 * GET /api/consultores/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔍 Buscando consultor:', id);

    const { data, error } = await supabase
      .from('consultores')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar consultor:', error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Consultor não encontrado',
      });
    }

    console.log('✅ Consultor encontrado:', data.nome);

    // 🆕 BUSCAR STATUS DA CONTA STRIPE
    let stripeStatus = null;
    if (data.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(data.stripe_account_id);
        stripeStatus = {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          tipo: account.metadata?.tipo || 'consultor',
        };
      } catch (stripeError) {
        console.error('⚠️ Erro ao buscar conta Stripe:', stripeError.message);
      }
    }

    return res.status(200).json({
      success: true,
      consultor: {
        ...data,
        stripe_status: stripeStatus, // ← ADICIONA STATUS DO STRIPE
      },
    });

  } catch (error) {
    console.error('❌ Erro ao buscar consultor:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao buscar consultor',
    });
  }
});

/**
 * CRIAR CONTA STRIPE CONNECT (LEGADO - Mantido por compatibilidade)
 * POST /api/consultores/criar-conta
 * 
 * ⚠️ NOTA: Esta rota é legada. Use /api/stripe-connect/approve-consultor para novos cadastros.
 */
router.post("/criar-conta", async (req, res) => {
  try {
    const { consultorId, email } = req.body;

    if (!consultorId || !email) {
      return res.status(400).json({
        success: false,
        error: 'consultorId e email são obrigatórios',
      });
    }

    console.log('🔄 Criando conta Stripe para consultor:', consultorId);

    // Criar conta Stripe Connect
    const accountResult = await createConnectAccount(consultorId, email);

    if (!accountResult.success) {
      return res.status(500).json(accountResult);
    }

    // Gerar link de onboarding
    const linkResult = await createOnboardingLink(
      accountResult.accountId,
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/consultor/onboarding/success`,
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/consultor/onboarding/refresh`
    );

    if (!linkResult.success) {
      return res.status(500).json(linkResult);
    }

    console.log('✅ Conta Stripe criada:', accountResult.accountId);

    return res.status(200).json({
      success: true,
      message: 'Conta Stripe criada com sucesso!',
      accountId: accountResult.accountId,
      onboardingUrl: linkResult.url,
      expiresAt: linkResult.expiresAt,
    });

  } catch (error) {
    console.error('❌ Erro ao criar conta Stripe:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao criar conta Stripe',
    });
  }
});

/**
 * 🆕 CRIAR NOVO LINK DE ONBOARDING (se o link expirou)
 * POST /api/consultores/:id/onboarding-link
 */
router.post('/:id/onboarding-link', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔄 Criando novo link de onboarding para consultor:', id);

    const { data: consultor, error } = await supabase
      .from('consultores')
      .select('stripe_account_id, nome, email')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!consultor) {
      return res.status(404).json({
        success: false,
        error: 'Consultor não encontrado',
      });
    }

    if (!consultor.stripe_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Consultor não possui conta Stripe. Crie uma primeiro.',
      });
    }

    // Criar novo link de onboarding
    const accountLink = await stripe.accountLinks.create({
      account: consultor.stripe_account_id,
      refresh_url: `${process.env.FRONTEND_URL}/consultor/onboarding/refresh`,
      return_url: `${process.env.FRONTEND_URL}/consultor/onboarding/success`,
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
 * ATUALIZAR DADOS DO CONSULTOR
 * PUT /api/consultores/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log('🔄 Atualizando consultor:', id);

    // Remover campos que não devem ser atualizados diretamente
    delete updateData.id;
    delete updateData.criado_em;
    delete updateData.stripe_account_id;

    // Adicionar timestamp de atualização
    updateData.atualizado_em = new Date().toISOString();

    const { data, error } = await supabase
      .from('consultores')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar consultor:', error);
      throw error;
    }

    console.log('✅ Consultor atualizado:', data.nome);

    return res.status(200).json({
      success: true,
      consultor: data,
      message: 'Consultor atualizado com sucesso!',
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar consultor:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao atualizar consultor',
    });
  }
});

/**
 * LISTAR TODOS OS CONSULTORES (COM FILTROS OPCIONAIS)
 * GET /api/consultores/list/all
 */
router.get('/list/all', async (req, res) => {
  try {
    const { aprovado, stripe_status } = req.query;

    console.log('📋 Listando consultores...');

    let query = supabase.from('consultores').select('*');

    // Filtros opcionais
    if (aprovado !== undefined) {
      query = query.eq('aprovado', aprovado === 'true');
    }

    if (stripe_status) {
      query = query.eq('stripe_account_status', stripe_status);
    }

    const { data, error } = await query.order('criado_em', { ascending: false });

    if (error) {
      console.error('❌ Erro ao listar consultores:', error);
      throw error;
    }

    console.log(`✅ ${data.length} consultores encontrados`);

    return res.status(200).json({
      success: true,
      consultores: data,
      count: data.length,
    });

  } catch (error) {
    console.error('❌ Erro ao listar consultores:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao listar consultores',
    });
  }
});

module.exports = router;