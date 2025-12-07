// backend/services/csvProcessor.js (CommonJS)

const Papa = require("papaparse");
const fs = require("fs");
const supabase = require("../utils/supabaseClient.js");

// Função para mapear as chaves do CSV (camelCase) para o DB (snake_case)
const mapKeysToSupabase = (data) => {
  // ⚠️ Assumindo que o CSV tem as chaves: nome, preco, precoCusto, estoque, estoqueMinimo, etc.
  return {
    nome: data.nome,
    sku: data.sku || null, // Permite SKU opcional
    categoria: parseInt(data.categoria) || null, // Converte ID para número
    descricao: data.descricao,
    preco: parseFloat(data.preco),
    preco_custo: parseFloat(data.precoCusto || 0), // DB snake_case
    estoque: parseInt(data.estoque),
    estoque_minimo: parseInt(data.estoqueMinimo || 5), // DB snake_case
    comissao: parseFloat(data.comissao || 10),
    tamanho: data.tamanho,
    cor: data.cor,
    peso: parseFloat(data.peso || 0),
    status: data.status || "ativo",
    imagem_url:
      data.imagemUrl ||
      "https://placehold.co/300x300/6c757d/ffffff?text=Produto",
    data_cadastro: new Date().toISOString(),
  };
};

/**
 * Processa o arquivo CSV, insere/atualiza os produtos no Supabase e limpa o arquivo temporário.
 * @param {string} filePath - Caminho completo para o arquivo CSV temporário.
 * @returns {object} Um objeto com a contagem de produtos inseridos e atualizados.
 */
async function processarCsvEImportar(filePath) {
  let produtosMapeados = [];

  // 1. LER e FAZER PARSING DO ARQUIVO CSV
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);

    Papa.parse(fileStream, {
      header: true, // Usa a primeira linha como cabeçalho
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(), // Remove espaços em branco do cabeçalho
      complete: async (results) => {
        // Mapeia e sanitiza os dados
        produtosMapeados = results.data
          .filter((p) => p.nome && p.preco && p.estoque) // Filtra linhas inválidas/mínimas
          .map(mapKeysToSupabase);

        if (produtosMapeados.length === 0) {
          fs.unlinkSync(filePath); // Limpa o arquivo temporário
          return reject({
            message: "Nenhum produto válido encontrado no CSV.",
          });
        }

        // 2. INSERIR/ATUALIZAR DADOS NO SUPABASE
        try {
          // Nota: O Supabase suporta a opção `onConflict` (UPSERT)
          // Usaremos 'sku' como o identificador único para UPSERT
          const { data, error } = await supabase
            .from("produtos")
            .upsert(produtosMapeados, {
              onConflict: "sku", // Chave para conflito
              ignoreDuplicates: false,
              defaultToNull: true,
            })
            .select(); // Retorna os produtos afetados

          // 3. LIMPAR ARQUIVO TEMPORÁRIO
          fs.unlinkSync(filePath);

          if (error) {
            console.error("Erro de UPSERT no Supabase:", error);
            return reject(error);
          }

          // Contagem simples (pode ser melhorada consultando o status do upsert)
          const totalProcessed = produtosMapeados.length;
          const totalAffected = data ? data.length : 0;

          resolve({
            totalProcessado: totalProcessed,
            totalInseridoOuAtualizado: totalAffected,
            produtosAfetados: data,
          });
        } catch (dbError) {
          fs.unlinkSync(filePath);
          console.error("Erro de Banco de Dados ou Mapeamento:", dbError);
          reject(dbError);
        }
      },
      error: (err) => {
        fs.unlinkSync(filePath);
        reject(err);
      },
    });
  });
}

module.exports = { processarCsvEImportar };