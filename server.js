const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const chalk = require("chalk");
const multer = require("multer");
const fs = require("fs");
const Stripe = require("stripe");

const supabase = require("./utils/supabaseClient.js");
const { processarCsvEImportar } = require("./services/csvProcessor.js");

// === ROTAS ===
const userRoutes = require("./routes/userRoutes.js");
const consultantRoutes = require("./routes/consultantRoutes.js");
const merchantRoutes = require("./routes/merchantRoutes.js");
const approvalRoutes = require("./routes/approvalRoutes.js");
const billingRoutes = require("./routes/billingRoutes.js");

// --- CONFIGURAÇÃO INICIAL ---
dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });

// --- INICIALIZAÇÃO DO STRIPE ---
let stripe;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log(chalk.green("✅ Stripe inicializado com sucesso!"));
  } else {
    console.log(chalk.yellow("⚠️  STRIPE_SECRET_KEY não encontrada no .env"));
  }
} catch (error) {
  console.log(chalk.red("❌ Erro ao inicializar Stripe:"), error.message);
}

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

// --- TESTE STRIPE ---
const testStripeConnection = async () => {
  if (!stripe) {
    log.warning("⚠️  Stripe não inicializado - verifique STRIPE_SECRET_KEY no .env");
    return;
  }

  try {
    const balance = await stripe.balance.retrieve();
    log.success("✅ Conexão com Stripe verificada com sucesso!");
    log.info(`💰 Moeda disponível: ${balance.available[0]?.currency || 'N/A'}`);
  } catch (error) {
    log.error(`❌ Erro na conexão com Stripe: ${error.message}`);
    
    if (error.type === 'StripeAuthenticationError') {
      log.error("🔑 Problema de autenticação - verifique STRIPE_SECRET_KEY");
    } else if (error.type === 'StripeConnectionError') {
      log.error("🌐 Problema de conexão com a API do Stripe");
    } else {
      log.error(`📋 Tipo de erro: ${error.type}`);
    }
  }
};

// --- CONFIGURAÇÃO DO CORS ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://plataforma-consultoria-mvp.onrender.com",
  "https://seu-frontend.onrender.com" // Adicione seu frontend aqui
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
    credentials: true
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- MIDDLEWARE PARA INJETAR STRIPE NAS ROTAS ---
app.use((req, res, next) => {
  req.stripe = stripe;
  next();
});

// --- ROTA PRINCIPAL ---
app.get("/", (req, res) => {
  const status = {
    message: "🚀 API da Plataforma de Consultoria de Compras",
    supabase: "✅ Conectado",
    stripe: stripe ? "✅ Conectado" : "❌ Não configurado",
    timestamp: new Date().toISOString()
  };
  
  res.json(status);
});

// --- ROTA DE STATUS DA API ---
app.get("/status", async (req, res) => {
  try {
    let stripeStatus = "not_configured";
    
    if (stripe) {
      try {
        await stripe.balance.retrieve();
        stripeStatus = "connected";
      } catch (error) {
        stripeStatus = `error: ${error.type}`;
      }
    }

    const status = {
      api: "online",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      services: {
        supabase: "connected",
        stripe: stripeStatus,
        file_upload: "ready"
      },
      endpoints: {
        users: "/api/users",
        consultores: "/api/consultores", 
        lojistas: "/api/lojistas",
        aprovacoes: "/api/aprovacoes",
        billing: "/api/vendas/*"
      }
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Erro ao verificar status" });
  }
});

// --- ROTA DE IMPORTAÇÃO CSV ---
app.post(
  "/api/lojistas/produtos/importar-csv",
  upload.single("csvFile"),
  async (req, res) => {
    log.info("⬇️ Recebendo arquivo CSV para processamento...");

    if (!req.file) {
      log.warning("⚠️ Nenhuma arquivo CSV enviado.");
      return res.status(400).json({
        error: 'Nenhum arquivo CSV enviado. Verifique se o campo é "csvFile".',
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

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.status(500).json({
        error: "Erro interno ao processar o arquivo CSV.",
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
app.use("/api", billingRoutes);

// --- ROTA DE TESTE STRIPE ---
app.get("/api/stripe/test", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({
      error: "Stripe não configurado",
      message: "Verifique STRIPE_SECRET_KEY no arquivo .env"
    });
  }

  try {
    const balance = await stripe.balance.retrieve();
    
    res.json({
      status: "success",
      message: "Conexão com Stripe funcionando corretamente",
      balance: {
        available: balance.available,
        pending: balance.pending
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.type,
      message: error.message,
      details: "Verifique se a chave Stripe está correta"
    });
  }
});

// --- ROTA SIMPLES DE CHECKOUT (Para teste) ---
app.post("/api/create-checkout-session", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe não configurado" });
  }

  try {
    const { planId, planName, price, successUrl, cancelUrl } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: planName,
            },
            unit_amount: price * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${req.headers.origin}/success.html`,
      cancel_url: cancelUrl || `${req.headers.origin}/cancel.html`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Erro ao criar sessão:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- MANIPULAÇÃO DE ERROS ---
app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado'
  });
});

// --- ROTA 404 ---
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const startServer = async (port) => {
  const server = http.createServer(app);
  
  server.listen(port, async () => {
    log.success(`✅ Servidor rodando na porta ${port}`);
    log.info(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    log.info(`🗄️  Supabase: ${process.env.SUPABASE_URL ? 'Configurado' : 'Não configurado'}`);
    log.info(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Configurado' : 'Não configurado'}`);
    
    await testStripeConnection();
    
    log.info("📋 Rotas disponíveis:");
    log.info("   GET  /status          - Status da API");
    log.info("   GET  /api/stripe/test - Teste do Stripe");
    log.info("   POST /api/create-checkout-session - Criar checkout");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log.warning(`⚠️ Porta ${port} ocupada. Tentando a próxima...`);
      startServer(port + 1);
    } else {
      log.error(`❌ Erro ao iniciar servidor: ${err.message}`);
      process.exit(1);
    }
  });
};

const PORT = parseInt(process.env.PORT) || 5000;
startServer(PORT);

// Export para testes
module.exports = { app, stripe };