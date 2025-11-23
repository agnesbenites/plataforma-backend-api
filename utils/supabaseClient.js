// backend/utils/supabaseClient.js (CommonJS)

const { createClient } = require("@supabase/supabase-js");
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;

// IMPORTANTE: Estamos usando SUPABASE_ANON_KEY para a chave de serviço
// no ambiente do servidor, pois é a variável que contém a chave secreta no seu .env.
// EM PRODUÇÃO REAL, USE UMA VARIÁVEL CHAMADA SUPABASE_SERVICE_ROLE_KEY
const supabaseSecretKey = process.env.SUPABASE_ANON_KEY;

// Para chamadas de servidor (Node.js), usamos a chave secreta de administrador.
const supabase = createClient(supabaseUrl, supabaseSecretKey);

module.exports = supabase;