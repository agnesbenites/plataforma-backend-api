// api-backend/middlewares/authMiddleware.js

const { auth } = require('express-oauth2-jwt-bearer');
const dotenv = require('dotenv');

dotenv.config();

// 🛑 Este middleware verifica o Access Token do Auth0 🛑

const checkJwt = auth({
    // Autoridade (Issuer Base URL) - Seu domínio Auth0
    issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}/`,
    
    // Audiência - O Identifier da sua API
    audience: process.env.AUTH0_AUDIENCE,
    
    // Se o token não for enviado ou for inválido, o middleware retorna 401
});

// Wrapper para extrair o ID do usuário (sub) e anexar ao req
const checkAuth = (req, res, next) => {
    // 1. Executa a validação JWT
    checkJwt(req, res, (err) => {
        if (err) {
            // Se o JWT for inválido ou ausente, retorna o erro 401
            return res.status(401).json({ 
                error: 'Token inválido ou ausente.', 
                details: err.message 
            });
        }
        
        // 2. Se o JWT for válido, o Auth0 injeta o payload em req.auth.payload.
        // O ID único do usuário no Auth0 está em req.auth.payload.sub
        
        // Acessamos o ID no formato 'auth0|12345...'
        const subId = req.auth.payload.sub; 

        // Você pode limpar para usar apenas o ID após o pipe, se quiser
        // Ex: const userId = subId.split('|')[1] || subId;
        
        req.user = { 
            id: subId, 
            auth0Id: subId
        };
        
        next();
    });
};

module.exports = {
    checkAuth,
};