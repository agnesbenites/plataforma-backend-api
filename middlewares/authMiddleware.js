// api-backend/middlewares/authMiddleware.js

// Este middleware foi simplificado pois a autenticação agora é via Supabase
const checkAuth = (req, res, next) => {
    // Por agora, ele apenas deixa passar. 
    // No futuro, podes implementar a verificação de token do Supabase aqui se necessário.
    next();
};

module.exports = { checkAuth };