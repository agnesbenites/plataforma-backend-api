// backend/routes/approvalRoutes.js
import express from "express";
import { getAll, updateStatus } from "../controllers/approvalController.js";

const router = express.Router();

// === LISTAR TODOS OS REGISTROS ===
// Exemplo: GET /api/aprovacoes/consultores  ou  /api/aprovacoes/lojistas
router.get("/:type", getAll);

// === ATUALIZAR STATUS (aprovar ou reprovar) ===
// Exemplo: PATCH /api/aprovacoes/consultores/5
router.patch("/:type/:id", updateStatus);

export default router;
