// Exemplo: api-backend/controllers/authController.js

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET; 
const supabase = require('../utils/supabaseClient'); 

async function login(req, res) {
    const { email, password } = req.body;

    // 1. SIMULAÇÃO OU AUTENTICAÇÃO REAL:
    // Exemplo: Buscar usuário no Supabase para verificar senha
    // const { data: user, error } = await supabase.from('usuarios').select('*').eq('email', email).single();
    // if (error || !user) return res.status(401).json({ message: 'Credenciais inválidas' });

    // 2. CRIAÇÃO DO PAYLOAD (Dados do Lojista, assumindo ID=1 para teste)
    const lojistaId = 1; 
    const payload = { 
        id: lojistaId, 
        tipo: 'lojista', 
        iat: Date.now() 
    };

    // 3. Geração do JWT
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); // Token de Acesso (1 hora)

    // 4. MUDANÇA CRÍTICA: ENVIA O TOKEN NO COOKIE HTTPONLY
    res.cookie('auth_token', token, {
        httpOnly: true,     // 🛑 Impede que scripts de frontend (XSS) leiam o cookie
        secure: process.env.NODE_ENV === 'production', // Use 'true' em produção (HTTPS)
        maxAge: 3600000,    // 1 hora de vida útil (em ms)
        sameSite: 'Lax'     // Previne ataques CSRF
    });

    // 5. Responde ao Frontend (sem o token no body, por segurança)
    res.status(200).json({ success: true, message: 'Login bem-sucedido.' });
}

module.exports = { login };