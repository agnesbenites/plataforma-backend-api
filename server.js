const express = require('express');
const http = require('http'); 
const dotenv = require('dotenv');
const cors = require('cors');

const supabase = require('./utils/supabaseClient'); 
const userRoutes = require('./routes/userRoutes');
const debugRoutes = require('./routes/debugRoutes');

// --- CONFIGURAÇÃO INICIAL ---
dotenv.config();

// --- CONFIGURAÇÃO DO STRIPE ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- FUNÇÃO DE TESTE ---
const testSupabaseConnection = () => {
    console.log('✅ Supabase Client inicializado. Verificação de conexão ocorre nas rotas (Auth).');
};
testSupabaseConnection();

// --- CONFIGURAÇÃO DO EXPRESS/HTTP ---
const app = express();

// ⚠️⚠️⚠️ WEBHOOK DO STRIPE DEVE VIR ANTES DO express.json() ⚠️⚠️⚠️
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (request, response) => {
  console.log('🔔 Webhook do Stripe recebido...');
  
  const sig = request.headers['stripe-signature'];
  let event;

  try {
    // Verificar assinatura do webhook
    event = stripe.webhooks.constructEvent(
      request.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log('✅ Webhook verificado:', event.type);
  } catch (err) {
    console.log('❌ Erro de assinatura do webhook:', err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Processar o evento
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('💰 Pagamento bem-sucedido:', paymentIntent.id);
      console.log('📦 Metadata:', paymentIntent.metadata);
      
      // Atualizar venda no Supabase
      if (paymentIntent.metadata.venda_id) {
        await atualizarStatusVenda(paymentIntent.metadata.venda_id, 'pago', paymentIntent.id);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('❌ Pagamento falhou:', failedPayment.id);
      
      if (failedPayment.metadata.venda_id) {
        await atualizarStatusVenda(failedPayment.metadata.venda_id, 'cancelado', failedPayment.id);
      }
      break;

    default:
      console.log(`⚡ Evento não tratado: ${event.type}`);
  }

  response.json({received: true});
});

// Função auxiliar para atualizar Supabase
async function atualizarStatusVenda(vendaId, status, paymentIntentId = null) {
  try {
    const updateData = { 
      status: status,
      updated_at: new Date().toISOString()
    };
    
    if (paymentIntentId) {
      updateData.stripe_payment_intent_id = paymentIntentId;
    }

    const { data, error } = await supabase
      .from('vendas')
      .update(updateData)
      .eq('id', vendaId);

    if (error) {
      console.log('❌ Erro ao atualizar venda no Supabase:', error);
    } else {
      console.log(`✅ Venda ${vendaId} atualizada para: ${status}`);
    }
  } catch (err) {
    console.log('💥 Erro ao conectar com Supabase:', err);
  }
}

// AGORA SIM O express.json() PARA AS OUTRAS ROTAS
const allowedOrigins = [
    'http://localhost:5173',
    'https://plataforma-consultoria-mvp.onrender.com'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); 
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Acesso CORS não permitido'), false);
        }
    }
}));

app.use(express.json()); // ⬅️ ESTE VEM DEPOIS DO WEBHOOK

const server = http.createServer(app); 

// --- ROTAS DA API ---
app.get('/', (req, res) => {
    if (supabase) {
        res.send('API de Consultoria de Compras (Supabase) rodando!');
    } else {
        res.status(500).send('Erro: Cliente Supabase não inicializado.');
    }
});

// Rotas existentes
app.use('/api/users', userRoutes);
app.use('/api/debug', debugRoutes);

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3001; 

server.listen(PORT, () => { 
    console.log(`🚀 Servidor HTTP rodando na porta ${PORT}`);
    console.log(`📋 Debug: http://localhost:${PORT}/api/debug/listar-tabelas`);
    console.log(`🔔 Webhook: https://plataforma-consultoria-mvp.onrender.com/api/webhooks/stripe`);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Erro não tratado:', err);
});

module.exports = app;