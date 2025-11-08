// backend/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const supabase = require("../utils/supabaseClient");

// POST /admin/send-message
router.post("/send-message", async (req, res) => {
  try {
    const { recipient, message } = req.body;

    if (!recipient || !message) {
      return res
        .status(400)
        .json({ error: "Destinatário e mensagem são obrigatórios" });
    }

    // Insere a mensagem no banco
    const { error } = await supabase.from("mensagens_admin").insert([
      {
        destinatario: recipient, // "consultores" ou "lojistas"
        mensagem: message,
        data_envio: new Date().toISOString(),
      },
    ]);

    if (error) throw error;

    res
      .status(200)
      .json({ success: true, message: "Mensagem enviada com sucesso!" });
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    res.status(500).json({ error: "Erro interno ao enviar mensagem" });
  }
});

module.exports = router;
