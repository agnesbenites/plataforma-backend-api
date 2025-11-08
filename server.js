// backend/server.js
import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";
import chalk from "chalk";
import multer from "multer"; // ⬅️ NOVO: Para processar upload de arquivos
import fs from "fs"; // ⬅️ NOVO: Para excluir o arquivo temporário

import supabase from "./utils/supabaseClient.js";
import { processarCsvEImportar } from "./services/csvProcessor.js"; // ⬅️ NOVO: Função de processamento

// === ROTAS ===
import userRoutes from "./routes/userRoutes.js";
import consultantRoutes from "./routes/consultantRoutes.js";
import merchantRoutes from "./routes/merchantRoutes.js";
import approvalRoutes from "./routes/approvalRoutes.js";

// --- CONFIGURAÇÃO INICIAL ---
dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" }); // ⬅️ NOVO: Configuração do Multer para salvar temporariamente

// --- LOG COLORIDO ---
const log = {
  info: (msg) => console.log(chalk.cyan(msg)),
  success: (msg) => console.log(chalk.green(msg)),
  warning: (msg) => console.log(chalk.yellow(msg)),
  error: (msg) => console.log(chalk.red(msg)),
};

// --- TESTE SUPABASE ---
const testSupabaseConnection = () => {
  if (supabase) {
    log.success("✅ Supabase Client inicializado com sucesso!");
  } else {
    log.error("❌ Erro: Supabase Client não foi inicializado corretamente.");
  }
};
testSupabaseConnection();

// --- CONFIGURAÇÃO DO CORS ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://plataforma-consultoria-mvp.onrender.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Acesso CORS não permitido por esta origem"), false);
      }
    },
  })
);

app.use(express.json());

// --- ROTA PRINCIPAL ---
app.get("/", (req, res) => {
  res.send(
    "🚀 API da Plataforma de Consultoria de Compras rodando com Supabase!"
  );
});

// --- ROTA DE IMPORTAÇÃO CSV (NOVA) ---
// Endpoint: POST /api/lojistas/produtos/importar-csv
app.post(
  "/api/lojistas/produtos/importar-csv",
  upload.single("csvFile"), // 'csvFile' é o nome esperado no campo do formulário do frontend
  async (req, res) => {
    log.info("⬇️ Recebendo arquivo CSV para processamento...");

    if (!req.file) {
      log.warning("⚠️ Nenhuma arquivo CSV enviado.");
      return res
        .status(400)
        .json({
          error:
            'Nenhum arquivo CSV enviado. Verifique se o campo é "csvFile".',
        });
    }

    const filePath = req.file.path;

    try {
      const resultado = await processarCsvEImportar(filePath);

      log.success(
        `⬆️ Importação concluída! Produtos afetados: ${resultado.totalInseridoOuAtualizado}`
      );

      res.status(200).json({
        message: "Importação CSV concluída com sucesso!",
        ...resultado,
      });
    } catch (error) {
      log.error(`❌ Falha na importação: ${error.message || String(error)}`);

      // Garantia de limpeza, mesmo em caso de erro
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.status(500).json({
        error:
          "Erro interno ao processar o arquivo CSV. Verifique o formato e as dependências.",
        details: error.message || String(error),
      });
    }
  }
);

// --- ROTAS DA API ---
app.use("/api/users", userRoutes);
app.use("/api/consultores", consultantRoutes);
app.use("/api/lojistas", merchantRoutes);
app.use("/api/aprovacoes", approvalRoutes);

// --- INICIALIZAÇÃO DO SERVIDOR ---
const startServer = async (port) => {
  const server = http.createServer(app);
  server.listen(port, () => {
    log.success(`✅ Servidor rodando na porta ${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log.warning(`⚠️ Porta ${port} ocupada. Tentando a próxima...`);
      startServer(port + 1);
    } else {
      log.error(`❌ Erro ao iniciar servidor: ${err.message}`);
    }
  });
};

const PORT = parseInt(process.env.PORT) || 5000;
startServer(PORT);
