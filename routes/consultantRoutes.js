const express = require("express");
const router = express.Router();

// Suas rotas de consultores aqui
router.get("/", (req, res) => {
  res.json({ message: "Rota de consultores" });
});

router.post("/criar-conta", (req, res) => {
  // Lógica Stripe Connect
  res.json({ message: "Conta Stripe criada" });
});

module.exports = router;