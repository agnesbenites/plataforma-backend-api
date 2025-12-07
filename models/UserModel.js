// backend/models/UserModel.js

const mongoose = require('mongoose');

// Define o Schema (a estrutura) do usuário
const UserSchema = new mongoose.Schema({
    // Tipo de usuário: Cliente, Consultor ou Loja (Essencial para Autorização!)
    type: {
        type: String,
        required: [true, 'O tipo de usuário é obrigatório'],
        enum: ['client', 'consultant', 'store', 'store_vendor'] // Valores permitidos
    },
    name: {
        type: String,
        required: true,
        trim: true // Remove espaços em branco
    },
    email: {
        type: String,
        required: true,
        unique: true, // Garante que não existam dois emails iguais
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: false // Opcional no MVP
    },
    password: {
        type: String,
        required: true
    },
    
    // --- Campos Específicos para Consultor ---
    specialty: { // Extraído via IA (futuro)
        type: [String],
        default: []
    },
    bio_ia: String, // Resumo do currículo processado
    rating: {
        type: Number,
        default: 0
    },
    totalSales: {
        type: Number,
        default: 0
    },

    // --- Campos Específicos para Loja (se for consultor ou vendedor) ---
    storeId: {
        type: mongoose.Schema.Types.ObjectId, // Referência a um ID de Loja (se implementarmos o modelo Store)
        ref: 'Store',
        default: null
    }

}, {
    timestamps: true // Adiciona automaticamente 'createdAt' e 'updatedAt'
});


// Exporta o Modelo para ser usado no servidor (API)
module.exports = mongoose.model('User', UserSchema);