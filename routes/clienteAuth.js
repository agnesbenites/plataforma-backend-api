// routes/clienteAuth.js
// Rotas de autenticação e cadastro do cliente (Mobile)

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../utils/supabaseClient');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// ========== CONFIGURAÇÕES ==========
const JWT_SECRET = process.env.JWT_SECRET;

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Armazenar códigos temporariamente (em produção, usar Redis)
const codigosValidacao = new Map();

// ========== FUNÇÕES AUXILIARES ==========

// Gerar código de 6 dígitos
function gerarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ========== ROTAS ==========

// 📧 POST /api/cliente/enviar-codigos-validacao
router.post('/enviar-codigos-validacao', async (req, res) => {
  try {
    const { email, telefone } = req.body;

    if (!email || !telefone) {
      return res.status(400).json({ 
        message: 'E-mail e telefone são obrigatórios' 
      });
    }

    // Verificar se e-mail já existe
    const { data: emailExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('email', email)
      .single();

    if (emailExistente) {
      return res.status(400).json({ 
        message: 'E-mail já cadastrado' 
      });
    }

    // Verificar se telefone já existe
    const { data: telefoneExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefone', telefone)
      .single();

    if (telefoneExistente) {
      return res.status(400).json({ 
        message: 'Telefone já cadastrado' 
      });
    }

    // Gerar códigos
    const codigoEmail = gerarCodigo();
    const codigoTelefone = gerarCodigo();

    // Armazenar códigos temporariamente (15 minutos)
    const chave = `${email}-${telefone}`;
    codigosValidacao.set(chave, {
      codigoEmail,
      codigoTelefone,
      expiraEm: Date.now() + 15 * 60 * 1000 // 15 minutos
    });

    // Enviar e-mail
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Código de Validação - Compra Smart',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px;">
              <h2 style="color: #2c5aa0;">Bem-vindo ao Compra Smart!</h2>
              <p style="font-size: 16px; color: #333;">Seu código de validação é:</p>
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
                <h1 style="color: #2c5aa0; font-size: 36px; margin: 0; letter-spacing: 5px;">${codigoEmail}</h1>
              </div>
              <p style="font-size: 14px; color: #666;">Este código expira em 15 minutos.</p>
              <p style="font-size: 14px; color: #666;">Se você não solicitou este código, ignore este e-mail.</p>
            </div>
          </div>
        `
      });
      console.log('✅ E-mail enviado para:', email);
    } catch (emailError) {
      console.error('❌ Erro ao enviar e-mail:', emailError);
    }

    // Enviar SMS via Twilio
    try {
      await twilioClient.messages.create({
        body: `Seu código de validação Compra Smart é: ${codigoTelefone}. Válido por 15 minutos.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+55${telefone}` // Adiciona +55 (Brasil)
      });
      console.log('✅ SMS enviado para:', telefone);
    } catch (smsError) {
      console.error('❌ Erro ao enviar SMS:', smsError);
      // Em desenvolvimento, logar o código no console
      console.log(`📱 Código SMS (DEV): ${codigoTelefone}`);
    }

    // Em desenvolvimento, retornar os códigos na resposta (REMOVER EM PRODUÇÃO)
    if (process.env.NODE_ENV === 'development') {
      console.log(`📧 Código E-mail: ${codigoEmail}`);
      console.log(`📱 Código SMS: ${codigoTelefone}`);
      return res.json({
        message: 'Códigos enviados com sucesso',
        dev: { codigoEmail, codigoTelefone } // REMOVER EM PRODUÇÃO
      });
    }

    res.json({ message: 'Códigos enviados com sucesso' });

  } catch (error) {
    console.error('❌ Erro ao enviar códigos:', error);
    res.status(500).json({ message: 'Erro ao enviar códigos' });
  }
});

// ✅ POST /api/cliente/validar-codigos
router.post('/validar-codigos', async (req, res) => {
  try {
    const { email, telefone, codigoEmail, codigoTelefone } = req.body;

    if (!email || !telefone || !codigoEmail || !codigoTelefone) {
      return res.status(400).json({ 
        message: 'Todos os campos são obrigatórios' 
      });
    }

    const chave = `${email}-${telefone}`;
    const dados = codigosValidacao.get(chave);

    if (!dados) {
      return res.status(400).json({ 
        message: 'Códigos não encontrados ou expirados' 
      });
    }

    // Verificar expiração
    if (Date.now() > dados.expiraEm) {
      codigosValidacao.delete(chave);
      return res.status(400).json({ 
        message: 'Códigos expirados. Solicite novos códigos.' 
      });
    }

    // Validar códigos
    if (dados.codigoEmail !== codigoEmail || dados.codigoTelefone !== codigoTelefone) {
      return res.status(400).json({ 
        message: 'Códigos inválidos' 
      });
    }

    // Códigos válidos - remover da memória
    codigosValidacao.delete(chave);

    res.json({ 
      message: 'Códigos validados com sucesso',
      validado: true
    });

  } catch (error) {
    console.error('❌ Erro ao validar códigos:', error);
    res.status(500).json({ message: 'Erro ao validar códigos' });
  }
});

// 📝 POST /api/cliente/cadastro
router.post('/cadastro', async (req, res) => {
  try {
    const { nome, cpf, telefone, email, senha, nomeVisivel } = req.body;

    // Validações
    if (!nome || !cpf || !telefone || !email || !senha) {
      return res.status(400).json({ 
        message: 'Todos os campos são obrigatórios' 
      });
    }

    // Verificar se e-mail já existe
    const { data: emailExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('email', email)
      .single();

    if (emailExistente) {
      return res.status(400).json({ 
        message: 'E-mail já cadastrado' 
      });
    }

    // Verificar se CPF já existe
    const { data: cpfExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('cpf', cpf)
      .single();

    if (cpfExistente) {
      return res.status(400).json({ 
        message: 'CPF já cadastrado' 
      });
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar cliente
    const { data: cliente, error } = await supabase
      .from('clientes')
      .insert([
        {
          nome,
          cpf,
          telefone,
          email,
          senha: senhaHash,
          nome_visivel: nomeVisivel !== undefined ? nomeVisivel : true,
          ativo: true,
          criado_em: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar cliente:', error);
      return res.status(500).json({ message: 'Erro ao criar conta' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        id: cliente.id, 
        email: cliente.email,
        tipo: 'cliente'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ Cliente cadastrado:', cliente.email);

    res.status(201).json({
      message: 'Cadastro realizado com sucesso',
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
        nomeVisivel: cliente.nome_visivel
      },
      token
    });

  } catch (error) {
    console.error('❌ Erro ao cadastrar cliente:', error);
    res.status(500).json({ message: 'Erro ao criar conta' });
  }
});

// 🔐 POST /api/cliente/login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ 
        message: 'E-mail e senha são obrigatórios' 
      });
    }

    // Buscar cliente
    const { data: cliente, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !cliente) {
      return res.status(401).json({ 
        message: 'E-mail ou senha incorretos' 
      });
    }

    // Verificar se está ativo
    if (!cliente.ativo) {
      return res.status(403).json({ 
        message: 'Conta desativada. Entre em contato com o suporte.' 
      });
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, cliente.senha);

    if (!senhaValida) {
      return res.status(401).json({ 
        message: 'E-mail ou senha incorretos' 
      });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        id: cliente.id, 
        email: cliente.email,
        tipo: 'cliente'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ Cliente logado:', cliente.email);

    res.json({
      message: 'Login realizado com sucesso',
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
        nomeVisivel: cliente.nome_visivel
      },
      token
    });

  } catch (error) {
    console.error('❌ Erro ao fazer login:', error);
    res.status(500).json({ message: 'Erro ao fazer login' });
  }
});

// Limpar códigos expirados a cada 5 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [chave, dados] of codigosValidacao.entries()) {
    if (agora > dados.expiraEm) {
      codigosValidacao.delete(chave);
    }
  }
}, 5 * 60 * 1000);

module.exports = router;