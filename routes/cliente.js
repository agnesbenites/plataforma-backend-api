// routes/cliente.js
// Rotas da API para o App Mobile do Cliente

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Middleware de autenticação
const authMiddleware = require('../middleware/authCliente');

// ==================== AUTENTICAÇÃO ====================

// POST /api/cliente/cadastro - Criar conta
router.post('/cadastro', async (req, res) => {
  try {
    const { nome, email, telefone, dataNascimento, senha, endereco, segmentos } = req.body;

    // Validações básicas
    if (!nome || !email || !telefone || !dataNascimento || !senha) {
      return res.status(400).json({ 
        success: false, 
        error: 'Todos os campos obrigatórios devem ser preenchidos' 
      });
    }

    // Verificar se email já existe
    // const clienteExistente = await Cliente.findOne({ email });
    // if (clienteExistente) {
    //   return res.status(400).json({ success: false, error: 'E-mail já cadastrado' });
    // }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar cliente no banco
    const novoCliente = {
      id: Date.now().toString(), // Substituir por UUID real
      nome,
      email,
      telefone,
      dataNascimento,
      senha: senhaHash,
      endereco,
      segmentos: segmentos || [],
      criadoEm: new Date(),
    };

    // await Cliente.create(novoCliente);

    // Gerar token JWT
    const token = jwt.sign(
      { id: novoCliente.id, email: novoCliente.email, tipo: 'cliente' },
      process.env.JWT_SECRET || 'sua-chave-secreta',
      { expiresIn: '30d' }
    );

    // Retornar sem a senha
    const { senha: _, ...clienteSemSenha } = novoCliente;

    res.status(201).json({
      success: true,
      user: clienteSemSenha,
      token,
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/cliente/login - Login com email/senha
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ 
        success: false, 
        error: 'E-mail e senha são obrigatórios' 
      });
    }

    // Buscar cliente
    // const cliente = await Cliente.findOne({ email });
    // if (!cliente) {
    //   return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    // }

    // Verificar senha
    // const senhaValida = await bcrypt.compare(senha, cliente.senha);
    // if (!senhaValida) {
    //   return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    // }

    // Mock de cliente para testes
    const cliente = {
      id: '1',
      nome: 'Cliente Teste',
      email: email,
      telefone: '11999999999',
      dataNascimento: '1990-01-15',
      segmentos: [1, 5, 7],
      endereco: {
        cidade: 'São Paulo',
        estado: 'SP',
      },
    };

    // Gerar token
    const token = jwt.sign(
      { id: cliente.id, email: cliente.email, tipo: 'cliente' },
      process.env.JWT_SECRET || 'sua-chave-secreta',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      user: cliente,
      token,
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/cliente/login-social - Login com Google/Apple
router.post('/login-social', async (req, res) => {
  try {
    const { provider, tokenSocial } = req.body;

    // TODO: Validar token com Google/Apple
    // const userData = await validateSocialToken(provider, tokenSocial);

    // Mock
    res.json({
      success: true,
      needsCompleteProfile: true, // Se precisa completar cadastro
      user: {
        email: 'usuario@gmail.com',
        nome: 'Usuário Social',
      },
    });
  } catch (error) {
    console.error('Erro no login social:', error);
    res.status(500).json({ success: false, error: 'Erro no login social' });
  }
});

// ==================== PERFIL ====================

// GET /api/cliente/perfil - Obter perfil
router.get('/perfil', authMiddleware, async (req, res) => {
  try {
    // const cliente = await Cliente.findById(req.userId);
    const cliente = {
      id: req.userId,
      nome: 'Cliente Teste',
      email: 'cliente@teste.com',
      telefone: '11999999999',
      dataNascimento: '1990-01-15',
      segmentos: [1, 5, 7],
    };

    res.json({ success: true, user: cliente });
  } catch (error) {
    console.error('Erro ao obter perfil:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter perfil' });
  }
});

// PUT /api/cliente/perfil - Atualizar perfil
router.put('/perfil', authMiddleware, async (req, res) => {
  try {
    const { nome, telefone, endereco } = req.body;

    // await Cliente.findByIdAndUpdate(req.userId, { nome, telefone, endereco });

    res.json({ success: true, message: 'Perfil atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar perfil' });
  }
});

// PUT /api/cliente/segmentos - Atualizar segmentos
router.put('/segmentos', authMiddleware, async (req, res) => {
  try {
    const { segmentos } = req.body;

    // await Cliente.findByIdAndUpdate(req.userId, { segmentos });

    res.json({ success: true, message: 'Segmentos atualizados com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar segmentos:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar segmentos' });
  }
});

// ==================== BUSCA ====================

// GET /api/cliente/busca/produto - Buscar por produto
router.get('/busca/produto', authMiddleware, async (req, res) => {
  try {
    const { termo, latitude, longitude, raio } = req.query;

    // TODO: Implementar busca real no banco
    // Buscar produtos que contenham o termo
    // Filtrar por lojas dentro do raio
    // Retornar consultores dessas lojas

    // Mock
    const resultados = [
      {
        tipo: 'produto',
        produto: { id: 1, nome: 'Vestido Vermelho Longo', preco: 199.90 },
        loja: { id: 1, nome: 'Moda Fashion', distancia: '2.5 km' },
        consultores: [
          { id: 1, nome: 'Ana Consultora', avaliacao: 4.8, disponivel: true },
        ],
      },
    ];

    res.json({ success: true, resultados });
  } catch (error) {
    console.error('Erro na busca:', error);
    res.status(500).json({ success: false, error: 'Erro na busca' });
  }
});

// GET /api/cliente/busca/segmento - Buscar por segmento
router.get('/busca/segmento', authMiddleware, async (req, res) => {
  try {
    const { segmentoId, latitude, longitude, raio } = req.query;

    // Mock
    const lojas = [
      { id: 1, nome: 'Loja Exemplo', segmento: 'Roupas', distancia: '1.5 km', avaliacao: 4.5 },
    ];

    res.json({ success: true, lojas });
  } catch (error) {
    console.error('Erro na busca:', error);
    res.status(500).json({ success: false, error: 'Erro na busca' });
  }
});

// ==================== LOJAS ====================

// GET /api/cliente/lojas/proximas - Lojas próximas
router.get('/lojas/proximas', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, raio, segmentos } = req.query;

    // TODO: Implementar busca geoespacial real
    // Mock
    const lojas = [
      {
        id: 1,
        nome: 'Magazine Tech',
        segmento: 'Eletrônicos',
        endereco: { cidade: 'São Paulo', bairro: 'Centro' },
        distancia: '1.2 km',
        avaliacao: 4.8,
        consultoresDisponiveis: 3,
      },
      {
        id: 2,
        nome: 'Moda Fashion',
        segmento: 'Roupas',
        endereco: { cidade: 'São Paulo', bairro: 'Jardins' },
        distancia: '2.5 km',
        avaliacao: 4.5,
        consultoresDisponiveis: 5,
      },
    ];

    res.json({ success: true, lojas });
  } catch (error) {
    console.error('Erro ao buscar lojas:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar lojas' });
  }
});

// GET /api/cliente/lojas/:id - Detalhes da loja
router.get('/lojas/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Mock
    const loja = {
      id,
      nome: 'Magazine Tech',
      descricao: 'Sua loja de tecnologia',
      segmentos: ['Eletrônicos', 'Informática'],
      endereco: {
        rua: 'Rua Exemplo',
        numero: '123',
        bairro: 'Centro',
        cidade: 'São Paulo',
        estado: 'SP',
      },
      avaliacao: 4.8,
      totalAvaliacoes: 156,
      horarioFuncionamento: '09:00 - 21:00',
      telefone: '(11) 1234-5678',
    };

    res.json({ success: true, loja });
  } catch (error) {
    console.error('Erro ao obter loja:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter loja' });
  }
});

// GET /api/cliente/lojas/:id/catalogo - Catálogo da loja
router.get('/lojas/:id/catalogo', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { categoria, ordem, pagina, limite } = req.query;

    // TODO: Filtrar produtos +18 baseado na idade do cliente

    // Mock
    const produtos = [
      { id: 1, nome: 'Smart TV 55"', preco: 2499.90, categoria: 'TVs', estoque: 5 },
      { id: 2, nome: 'Notebook Gamer', preco: 4999.90, categoria: 'Notebooks', estoque: 3 },
    ];

    res.json({ success: true, produtos, total: 2 });
  } catch (error) {
    console.error('Erro ao obter catálogo:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter catálogo' });
  }
});

// GET /api/cliente/lojas/:id/consultores - Consultores da loja
router.get('/lojas/:id/consultores', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Mock
    const consultores = [
      { id: 1, nome: 'João Consultor', avaliacao: 4.9, disponivel: true, especialidades: ['TVs', 'Som'] },
      { id: 2, nome: 'Maria Consultora', avaliacao: 4.7, disponivel: false, especialidades: ['Notebooks'] },
    ];

    res.json({ success: true, consultores });
  } catch (error) {
    console.error('Erro ao obter consultores:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter consultores' });
  }
});

// ==================== ATENDIMENTO ====================

// POST /api/cliente/atendimento/iniciar - Iniciar atendimento
router.post('/atendimento/iniciar', authMiddleware, async (req, res) => {
  try {
    const { lojaId, consultorId, produtoInteresse } = req.body;

    // Criar atendimento no banco
    const atendimento = {
      id: Date.now().toString(),
      clienteId: req.userId,
      lojaId,
      consultorId: consultorId || null, // Se null, vai para fila geral
      produtoInteresse,
      status: 'aguardando',
      criadoEm: new Date(),
    };

    // TODO: Notificar consultor via Socket.io

    res.json({ 
      success: true, 
      atendimento,
      message: consultorId ? 'Aguardando consultor aceitar' : 'Você está na fila'
    });
  } catch (error) {
    console.error('Erro ao iniciar atendimento:', error);
    res.status(500).json({ success: false, error: 'Erro ao iniciar atendimento' });
  }
});

// GET /api/cliente/atendimento/atual - Atendimento atual
router.get('/atendimento/atual', authMiddleware, async (req, res) => {
  try {
    // Buscar atendimento ativo do cliente
    // const atendimento = await Atendimento.findOne({ 
    //   clienteId: req.userId, 
    //   status: { $in: ['aguardando', 'em_andamento'] }
    // });

    // Mock
    const atendimento = null;

    res.json({ success: true, atendimento });
  } catch (error) {
    console.error('Erro ao obter atendimento:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter atendimento' });
  }
});

// POST /api/cliente/atendimento/:id/finalizar - Finalizar atendimento
router.post('/atendimento/:id/finalizar', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // await Atendimento.findByIdAndUpdate(id, { status: 'finalizado', finalizadoEm: new Date() });

    res.json({ success: true, message: 'Atendimento finalizado' });
  } catch (error) {
    console.error('Erro ao finalizar atendimento:', error);
    res.status(500).json({ success: false, error: 'Erro ao finalizar atendimento' });
  }
});

// POST /api/cliente/atendimento/:id/avaliar - Avaliar atendimento
router.post('/atendimento/:id/avaliar', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { nota, comentario } = req.body;

    if (!nota || nota < 1 || nota > 5) {
      return res.status(400).json({ success: false, error: 'Nota deve ser entre 1 e 5' });
    }

    // Salvar avaliação
    // await Avaliacao.create({ atendimentoId: id, clienteId: req.userId, nota, comentario });

    res.json({ success: true, message: 'Avaliação registrada' });
  } catch (error) {
    console.error('Erro ao avaliar:', error);
    res.status(500).json({ success: false, error: 'Erro ao avaliar atendimento' });
  }
});

// ==================== CARRINHO ====================

// GET /api/cliente/carrinho - Obter carrinho
router.get('/carrinho', authMiddleware, async (req, res) => {
  try {
    // const carrinho = await Carrinho.findOne({ clienteId: req.userId });
    
    // Mock
    const carrinho = {
      itens: [],
      total: 0,
    };

    res.json({ success: true, carrinho });
  } catch (error) {
    console.error('Erro ao obter carrinho:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter carrinho' });
  }
});

// POST /api/cliente/carrinho/adicionar - Adicionar ao carrinho
router.post('/carrinho/adicionar', authMiddleware, async (req, res) => {
  try {
    const { produtoId, quantidade, lojaId } = req.body;

    // Adicionar item ao carrinho do cliente

    res.json({ success: true, message: 'Produto adicionado ao carrinho' });
  } catch (error) {
    console.error('Erro ao adicionar ao carrinho:', error);
    res.status(500).json({ success: false, error: 'Erro ao adicionar ao carrinho' });
  }
});

// POST /api/cliente/carrinho/reservar - Reservar produtos
router.post('/carrinho/reservar', authMiddleware, async (req, res) => {
  try {
    const { lojaId, observacoes } = req.body;

    // Criar reserva para retirada na loja

    const reserva = {
      id: Date.now().toString(),
      clienteId: req.userId,
      lojaId,
      status: 'pendente',
      observacoes,
      criadoEm: new Date(),
    };

    res.json({ 
      success: true, 
      reserva,
      message: 'Produtos reservados! Retire na loja.' 
    });
  } catch (error) {
    console.error('Erro ao reservar:', error);
    res.status(500).json({ success: false, error: 'Erro ao reservar produtos' });
  }
});

// ==================== HISTÓRICO ====================

// GET /api/cliente/historico/compras - Histórico de compras
router.get('/historico/compras', authMiddleware, async (req, res) => {
  try {
    const { pagina, limite } = req.query;

    // Mock
    const compras = [
      {
        id: 1,
        data: '2024-01-15',
        loja: 'Magazine Tech',
        total: 2499.90,
        status: 'concluida',
        itens: 2,
      },
    ];

    res.json({ success: true, compras, total: 1 });
  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter histórico' });
  }
});

// ==================== PROMOÇÕES ====================

// GET /api/cliente/promocoes - Obter promoções
router.get('/promocoes', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, segmentos } = req.query;

    // Mock
    const promocoes = [
      {
        id: 1,
        titulo: 'Black Friday Antecipada',
        desconto: '50%',
        loja: { id: 1, nome: 'Magazine Tech' },
        validoAte: '2024-11-30',
      },
    ];

    res.json({ success: true, promocoes });
  } catch (error) {
    console.error('Erro ao obter promoções:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter promoções' });
  }
});

// ==================== NOTIFICAÇÕES ====================

// GET /api/cliente/notificacoes - Obter notificações
router.get('/notificacoes', authMiddleware, async (req, res) => {
  try {
    // Mock
    const notificacoes = [
      {
        id: 1,
        titulo: 'Promoção especial!',
        mensagem: '50% de desconto em eletrônicos',
        lida: false,
        criadoEm: new Date(),
      },
    ];

    res.json({ success: true, notificacoes });
  } catch (error) {
    console.error('Erro ao obter notificações:', error);
    res.status(500).json({ success: false, error: 'Erro ao obter notificações' });
  }
});

// POST /api/cliente/notificacoes/token - Registrar token push
router.post('/notificacoes/token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;

    // Salvar token de push notification do cliente
    // await Cliente.findByIdAndUpdate(req.userId, { pushToken: token });

    res.json({ success: true, message: 'Token registrado' });
  } catch (error) {
    console.error('Erro ao registrar token:', error);
    res.status(500).json({ success: false, error: 'Erro ao registrar token' });
  }
});

module.exports = router;