// backend/routes/userRoutes.js (VERSÃO CORRIGIDA)

// 1. Usar 'import' em vez de 'require'
import express from "express";
import { registerUser, loginUser } from "../controllers/userController.js";
// OBS: Se userController for um arquivo .js, você precisa adicionar a extensão .js aqui.

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// 2. Usar 'export default' em vez de 'module.exports'
export default router;
