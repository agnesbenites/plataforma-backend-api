// backend/routes/userRoutes.js (VERSÃO COMMONJS - CORRIGIDA)

const express = require("express");
const { registerUser, loginUser } = require("../controllers/userController.js");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Usar module.exports em vez de export default
module.exports = router;