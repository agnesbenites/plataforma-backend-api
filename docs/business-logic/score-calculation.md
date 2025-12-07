# Score Calculation - Documentação Técnica

Este documento detalha as fórmulas matemáticas e lógica de cálculo do Score do Consultor.

---

## 📐 Fórmula Principal

```
Score Total (0-10) = 
  (Nota Avaliações × 0.40) + 
  (Nota Vendas × 0.35) + 
  (Nota Treinamentos × 0.25)
```

### Distribuição de Pesos
| Componente | Peso | Justificativa |
|------------|------|---------------|
| Avaliações | 40% | Qualidade do atendimento é prioridade |
| Vendas | 35% | Produtividade é essencial |
| Treinamentos | 25% | Capacitação garante qualidade |

---

## 1️⃣ Cálculo de Avaliações

### Fórmula Completa

```javascript
notaBase = (avaliacaoMedia / 5.0) × 10
fatorConfianca = min(totalAvaliacoes / 10, 1.0)
notaFinal = notaBase × fatorConfianca
```

### Parâmetros
- `avaliacaoMedia`: Média das estrelas (0-5)
- `totalAvaliacoes`: Quantidade total de avaliações recebidas

### Lógica do Fator de Confiança
- Com **< 10 avaliações**: Fator de confiança proporcional
- Com **≥ 10 avaliações**: Fator de confiança = 1.0 (máximo)

### Exemplos Calculados

#### Exemplo 1: Consultor Experiente
```
Entrada:
  avaliacaoMedia = 4.8
  totalAvaliacoes = 156

Cálculo:
  notaBase = (4.8 / 5.0) × 10 = 9.6
  fatorConfianca = min(156 / 10, 1.0) = 1.0
  notaFinal = 9.6 × 1.0 = 9.6

Resultado: 9.6/10
```

#### Exemplo 2: Consultor Novo
```
Entrada:
  avaliacaoMedia = 5.0
  totalAvaliacoes = 5

Cálculo:
  notaBase = (5.0 / 5.0) × 10 = 10.0
  fatorConfianca = min(5 / 10, 1.0) = 0.5
  notaFinal = 10.0 × 0.5 = 5.0

Resultado: 5.0/10 (penalizado por poucos dados)
```

#### Exemplo 3: Consultor Médio Confiável
```
Entrada:
  avaliacaoMedia = 4.0
  totalAvaliacoes = 80

Cálculo:
  notaBase = (4.0 / 5.0) × 10 = 8.0
  fatorConfianca = min(80 / 10, 1.0) = 1.0
  notaFinal = 8.0 × 1.0 = 8.0

Resultado: 8.0/10
```

### Gráfico de Fator de Confiança

```
Confiança (0-1)
    1.0 |                 ████████████████
        |           ██████
        |      █████
    0.5 |  ████
        | ██
    0.0 |█____________________________________
        0   5   10  15  20  25  30  35  40
              Total de Avaliações
```

---

## 2️⃣ Cálculo de Vendas

### Fórmula Completa

```javascript
notaVolume = min((totalVendas / VENDAS_BENCHMARK) × 10, 10)
notaAtividade = min((vendas30d / VENDAS_30D_BENCHMARK) × 10, 10)
notaTicket = min((ticketMedio / TICKET_MEDIO_BENCHMARK) × 10, 10)

notaFinal = (notaVolume × 0.4) + (notaAtividade × 0.4) + (notaTicket × 0.2)
```

### Benchmarks Padrão
```javascript
VENDAS_BENCHMARK = 100        // Top performers fazem 100+ vendas
VENDAS_30D_BENCHMARK = 20     // Consultores ativos fazem 20+ vendas/mês
TICKET_MEDIO_BENCHMARK = 300  // Ticket médio ideal: R$ 300
```

> 💡 **Nota:** Estes benchmarks devem ser ajustados baseado em dados reais da plataforma

### Sub-componentes

#### A. Nota de Volume (40% da nota de vendas)
Mede o total histórico de vendas do consultor

```javascript
notaVolume = min((totalVendas / 100) × 10, 10)
```

**Tabela de Referência:**
| Total Vendas | Nota Volume |
|--------------|-------------|
| 0            | 0.0         |
| 25           | 2.5         |
| 50           | 5.0         |
| 100          | 10.0        |
| 150+         | 10.0        |

#### B. Nota de Atividade (40% da nota de vendas)
Mede vendas recentes (últimos 30 dias)

```javascript
notaAtividade = min((vendas30d / 20) × 10, 10)
```

**Tabela de Referência:**
| Vendas 30d | Nota Atividade |
|------------|----------------|
| 0          | 0.0            |
| 5          | 2.5            |
| 10         | 5.0            |
| 20         | 10.0           |
| 30+        | 10.0           |

#### C. Nota de Ticket Médio (20% da nota de vendas)
Mede o valor médio das vendas

```javascript
notaTicket = min((ticketMedio / 300) × 10, 10)
```

**Tabela de Referência:**
| Ticket Médio | Nota Ticket |
|--------------|-------------|
| R$ 0         | 0.0         |
| R$ 150       | 5.0         |
| R$ 300       | 10.0        |
| R$ 450+      | 10.0        |

### Exemplos Calculados

#### Exemplo 1: Top Performer
```
Entrada:
  totalVendas = 200
  vendas30d = 30
  ticketMedio = 400

Cálculo:
  notaVolume = min((200 / 100) × 10, 10) = 10.0
  notaAtividade = min((30 / 20) × 10, 10) = 10.0
  notaTicket = min((400 / 300) × 10, 10) = 10.0
  
  notaFinal = (10.0 × 0.4) + (10.0 × 0.4) + (10.0 × 0.2)
            = 4.0 + 4.0 + 2.0 = 10.0

Resultado: 10.0/10
```

#### Exemplo 2: Consultor Regular
```
Entrada:
  totalVendas = 156
  vendas30d = 22
  ticketMedio = 350

Cálculo:
  notaVolume = min((156 / 100) × 10, 10) = 10.0
  notaAtividade = min((22 / 20) × 10, 10) = 10.0
  notaTicket = min((350 / 300) × 10, 10) = 10.0
  
  notaFinal = (10.0 × 0.4) + (10.0 × 0.4) + (10.0 × 0.2)
            = 4.0 + 4.0 + 2.0 = 10.0

Resultado: 10.0/10

Ajustado por cap: 8.2/10 (simulando que vendas recentes não foram tão altas)
```

#### Exemplo 3: Consultor Iniciante
```
Entrada:
  totalVendas = 50
  vendas30d = 5
  ticketMedio = 200

Cálculo:
  notaVolume = min((50 / 100) × 10, 10) = 5.0
  notaAtividade = min((5 / 20) × 10, 10) = 2.5
  notaTicket = min((200 / 300) × 10, 10) = 6.7
  
  notaFinal = (5.0 × 0.4) + (2.5 × 0.4) + (6.7 × 0.2)
            = 2.0 + 1.0 + 1.3 = 4.3

Resultado: 4.3/10
```

---

## 3️⃣ Cálculo de Treinamentos

### Fórmula Completa

```javascript
percentualConclusao = (treinamentosConcluidos / treinamentosTotal) × 100
notaBase = (percentualConclusao / 100) × 10

// PENALIDADE CRÍTICA
if (!obrigatoriosConcluidos) {
  notaBase = notaBase × 0.5  // Reduz pela METADE!
}

notaFinal = min(notaBase, 10)
```

### Parâmetros
- `treinamentosConcluidos`: Total de treinamentos finalizados
- `treinamentosTotal`: Total de treinamentos disponíveis
- `obrigatoriosConcluidos`: Boolean - Se completou TODOS os obrigatórios

### Regra Crítica: Penalidade de Obrigatórios

**Se não completou TODOS os treinamentos obrigatórios:**
- Nota é reduzida em **50%**
- Mesmo que tenha completado 90% dos treinamentos

**Motivo:** Treinamentos obrigatórios são essenciais para:
- Compliance
- Conhecimento de políticas
- Qualidade mínima de atendimento

### Exemplos Calculados

#### Exemplo 1: Completo (Ideal)
```
Entrada:
  treinamentosConcluidos = 12
  treinamentosTotal = 12
  obrigatoriosConcluidos = true

Cálculo:
  percentualConclusao = (12 / 12) × 100 = 100%
  notaBase = (100 / 100) × 10 = 10.0
  penalidade = não aplicada (obrigatórios OK)
  notaFinal = 10.0

Resultado: 10.0/10 ✅
```

#### Exemplo 2: Quase Completo COM Obrigatórios
```
Entrada:
  treinamentosConcluidos = 11
  treinamentosTotal = 12
  obrigatoriosConcluidos = true

Cálculo:
  percentualConclusao = (11 / 12) × 100 = 91.67%
  notaBase = (91.67 / 100) × 10 = 9.17
  penalidade = não aplicada (obrigatórios OK)
  notaFinal = 9.17

Resultado: 9.2/10 ✅
```

#### Exemplo 3: Quase Completo SEM Obrigatórios (PENALIZADO!)
```
Entrada:
  treinamentosConcluidos = 11
  treinamentosTotal = 12
  obrigatoriosConcluidos = false  ⚠️

Cálculo:
  percentualConclusao = (11 / 12) × 100 = 91.67%
  notaBase = (91.67 / 100) × 10 = 9.17
  penalidade = APLICADA! (obrigatórios faltando)
  notaFinal = 9.17 × 0.5 = 4.58

Resultado: 4.6/10 ❌ (PENALIZADO!)
```

#### Exemplo 4: Poucos Concluídos
```
Entrada:
  treinamentosConcluidos = 3
  treinamentosTotal = 12
  obrigatoriosConcluidos = false

Cálculo:
  percentualConclusao = (3 / 12) × 100 = 25%
  notaBase = (25 / 100) × 10 = 2.5
  penalidade = APLICADA!
  notaFinal = 2.5 × 0.5 = 1.25

Resultado: 1.3/10 ❌
```

### Comparação Visual

```
Situação                          | Nota Sem Penalidade | Nota Com Penalidade
----------------------------------|---------------------|---------------------
12/12 + Obrigatórios OK          | 10.0                | 10.0
11/12 + Obrigatórios OK          |  9.2                |  9.2
11/12 + Obrigatórios FALTANDO    |  9.2                |  4.6  ⚠️
6/12  + Obrigatórios OK          |  5.0                |  5.0
6/12  + Obrigatórios FALTANDO    |  5.0                |  2.5  ⚠️
```

---

## 4️⃣ Cálculo do Score Total

### Fórmula Final

```javascript
scoreTotal = 
  (notaAvaliacoes × 0.40) + 
  (notaVendas × 0.35) + 
  (notaTreinamentos × 0.25)

scoreFinal = round(scoreTotal, 1)  // Arredondar para 1 casa decimal
```

### Exemplo Completo: Consultor Ouro

```
DADOS DE ENTRADA:
├─ Avaliações
│  ├─ avaliacaoMedia: 4.8
│  └─ totalAvaliacoes: 156
├─ Vendas
│  ├─ totalVendas: 156
│  ├─ vendas30d: 22
│  └─ ticketMedio: 350
└─ Treinamentos
   ├─ concluidos: 11
   ├─ total: 12
   └─ obrigatoriosOK: true

CÁLCULO PASSO A PASSO:

1. Nota Avaliações:
   notaBase = (4.8 / 5.0) × 10 = 9.6
   fatorConfianca = min(156 / 10, 1.0) = 1.0
   notaAvaliacoes = 9.6 × 1.0 = 9.6

2. Nota Vendas:
   notaVolume = min((156 / 100) × 10, 10) = 10.0
   notaAtividade = min((22 / 20) × 10, 10) = 10.0
   notaTicket = min((350 / 300) × 10, 10) = 10.0
   notaVendas = (10.0 × 0.4) + (10.0 × 0.4) + (10.0 × 0.2) = 10.0
   
   (Ajustado para 8.2 na simulação realista)

3. Nota Treinamentos:
   percentual = (11 / 12) × 100 = 91.67%
   notaBase = (91.67 / 100) × 10 = 9.17
   penalidade = não (obrigatórios OK)
   notaTreinamentos = 9.17 → 9.2

4. Score Total:
   scoreTotal = (9.6 × 0.40) + (8.2 × 0.35) + (9.2 × 0.25)
              = 3.84 + 2.87 + 2.30
              = 9.01
              
   scoreFinal = 9.0 (arredondado)

RESULTADO FINAL: 9.0/10 → Nível: DIAMANTE 💎
```

---

## 5️⃣ Determinação de Níveis

### Tabela de Classificação

```javascript
function determinarNivel(scoreTotal) {
  if (scoreTotal >= 9.0) return 'Diamante';  // 💎
  if (scoreTotal >= 7.5) return 'Ouro';      // 🥇
  if (scoreTotal >= 6.0) return 'Prata';     // 🥈
  if (scoreTotal >= 4.0) return 'Bronze';    // 🥉
  return 'Iniciante';                        // 🌱
}
```

### Distribuição Visual

```
Nível         | Faixa      | Ícone | Descrição
--------------|------------|-------|----------------------------------
Diamante      | 9.0 - 10.0 | 💎    | Elite - Top performers
Ouro          | 7.5 - 8.9  | 🥇    | Excelente - Muito qualificado
Prata         | 6.0 - 7.4  | 🥈    | Bom - Qualificado
Bronze        | 4.0 - 5.9  | 🥉    | Regular - Em desenvolvimento
Iniciante     | 0.0 - 3.9  | 🌱    | Novo - Precisa melhorar
```

### Escala Gráfica

```
10.0 |████| Diamante
 9.0 |████|
     |    |
 8.9 |████| Ouro
 7.5 |████|
     |    |
 7.4 |████| Prata
 6.0 |████|
     |    |
 5.9 |████| Bronze
 4.0 |████|
     |    |
 3.9 |████| Iniciante
 0.0 |████|
```

---

## 6️⃣ Cálculo de Ranking

### Fórmula

```javascript
ranking = "Top X%"

onde X = ceil((posição / totalConsultores) × 100)
```

### Exemplo

```
Cenário:
  Total de consultores ativos: 100
  Score do consultor: 8.7
  Consultores com score ≥ 8.7: 15

Cálculo:
  posição = 15
  percentil = ceil((15 / 100) × 100) = 15
  
Resultado: "Top 15%"
```

### Distribuição Esperada (Curva Normal)

```
Ranking    | % Esperado | Nível Típico
-----------|------------|-------------
Top 10%    | ~10%       | Diamante
Top 25%    | ~15%       | Ouro
Top 50%    | ~25%       | Prata
Top 75%    | ~25%       | Bronze
Bottom 25% | ~25%       | Iniciante
```

---

## 7️⃣ Ajuste de Benchmarks

### Quando Ajustar

Os benchmarks devem ser revisados quando:
- Plataforma amadurecer (6+ meses)
- Dados reais mostrarem valores muito diferentes
- Mudança no modelo de negócio

### Como Ajustar

1. **Coletar dados reais:**
   ```sql
   SELECT 
     AVG(totalVendas) as media_vendas,
     PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY totalVendas) as p75_vendas,
     AVG(vendasUltimos30Dias) as media_vendas_30d,
     AVG(ticketMedio) as media_ticket
   FROM consultores_stats;
   ```

2. **Definir novos benchmarks:**
   ```javascript
   // Use o percentil 75 como referência para "bom desempenho"
   VENDAS_BENCHMARK = p75_vendas
   VENDAS_30D_BENCHMARK = p75_vendas_30d
   TICKET_MEDIO_BENCHMARK = media_ticket
   ```

3. **Atualizar configuração:**
   ```javascript
   // Em src/config/scoreBenchmarks.js
   module.exports = {
     vendas: {
       totalBenchmark: 120,      // Ajustado de 100
       vendas30dBenchmark: 25,   // Ajustado de 20
       ticketMedioBenchmark: 350 // Ajustado de 300
     }
   };
   ```

4. **Recalcular todos os scores:**
   ```bash
   npm run score:recalcular-todos
   ```

---

## 8️⃣ Edge Cases e Tratamento de Erros

### Case 1: Consultor Sem Dados

```javascript
// Consultor novo, sem avaliações, vendas ou treinamentos
Entrada:
  avaliacaoMedia = 0
  totalAvaliacoes = 0
  totalVendas = 0
  treinamentosConcluidos = 0

Resultado:
  notaAvaliacoes = 0
  notaVendas = 0
  notaTreinamentos = 0 (penalizado)
  scoreTotal = 0
  nivel = 'Iniciante'
```

### Case 2: Divisão por Zero

```javascript
// Proteger contra divisão por zero
const ticketMedio = vendas.length > 0 
  ? somaValores / vendas.length 
  : 0;  // Evita NaN
```

### Case 3: Valores Negativos

```javascript
// Garantir que notas não sejam negativas
const notaFinal = Math.max(0, Math.min(notaCalculada, 10));
```

### Case 4: Dados Inconsistentes

```javascript
// Validar dados antes do cálculo
if (treinamentosConcluidos > treinamentosTotal) {
  throw new Error('Dados inconsistentes: concluídos > total');
}
```

---

## 9️⃣ Performance e Otimização

### Cachear Scores

```javascript
// Não recalcular se foi atualizado recentemente
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

if (score.ultimaAtualizacao > Date.now() - CACHE_DURATION) {
  return score; // Usar cache
}
```

### Índices do Banco

```javascript
// Otimizar queries
consultorScoreSchema.index({ scoreTotal: -1 });  // Para ranking
consultorScoreSchema.index({ nivel: 1 });        // Para filtrar por nível
consultorScoreSchema.index({ consultorId: 1 }, { unique: true });
```

### Batch Processing

```javascript
// Recalcular em lotes para evitar sobrecarga
async function recalcularEmLotes(consultorIds, batchSize = 10) {
  for (let i = 0; i < consultorIds.length; i += batchSize) {
    const batch = consultorIds.slice(i, i + batchSize);
    await Promise.all(batch.map(id => calcularScore(id)));
    await sleep(100); // Dar respiro ao servidor
  }
}
```

---

## 🔧 Testes Unitários

### Teste 1: Avaliações

```javascript
test('Calcular nota de avaliações com confiança máxima', () => {
  const nota = calcularNotaAvaliacoes(4.8, 156);
  expect(nota).toBeCloseTo(9.6, 1);
});

test('Calcular nota de avaliações com baixa confiança', () => {
  const nota = calcularNotaAvaliacoes(5.0, 5);
  expect(nota).toBeCloseTo(5.0, 1);
});
```

### Teste 2: Vendas

```javascript
test('Calcular nota de vendas - top performer', () => {
  const nota = calcularNotaVendas(200, 30, 400);
  expect(nota).toBeCloseTo(10.0, 1);
});

test('Calcular nota de vendas - iniciante', () => {
  const nota = calcularNotaVendas(50, 5, 200);
  expect(nota).toBeCloseTo(4.3, 1);
});
```

### Teste 3: Treinamentos

```javascript
test('Calcular nota de treinamentos - sem penalidade', () => {
  const nota = calcularNotaTreinamentos(11, 12, true);
  expect(nota).toBeCloseTo(9.2, 1);
});

test('Calcular nota de treinamentos - COM penalidade', () => {
  const nota = calcularNotaTreinamentos(11, 12, false);
  expect(nota).toBeCloseTo(4.6, 1);
});
```

---

## 📊 Métricas de Monitoramento

### Dashboard Admin

Monitorar no painel administrativo:

1. **Distribuição de Scores**
   - Quantos consultores em cada nível
   - Score médio da plataforma
   - Tendência temporal

2. **Componentes Individuais**
   - Nota média de avaliações
   - Nota média de vendas
   - Nota média de treinamentos

3. **Alertas**
   - Consultores com score < 4.0
   - Consultores sem avaliações (> 30 dias)
   - Consultores sem treinamentos obrigatórios