// backend/controllers/userController.js (CommonJS)

const registerUser = async (req, res) => {
  try {
    const { email, password, nome, tipo } = req.body;
    
    // Sua lógica de registro aqui
    console.log("Registrando usuário:", { email, nome, tipo });
    
    res.status(201).json({
      success: true,
      message: "Usuário registrado com sucesso",
      user: { email, nome, tipo }
    });
  } catch (error) {
    console.error("Erro no registro:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao registrar usuário",
      error: error.message
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Sua lógica de login aqui
    console.log("Login attempt:", email);
    
    res.status(200).json({
      success: true,
      message: "Login realizado com sucesso",
      token: "jwt-token-aqui",
      user: { email, nome: "Usuário Teste" }
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(401).json({
      success: false,
      message: "Credenciais inválidas",
      error: error.message
    });
  }
};

// Exportar usando module.exports
module.exports = {
  registerUser,
  loginUser
};