// test-simple.js
console.log('🚀 TESTE INICIADO');

const notificationService = require('./utils/notificationService');

console.log('✅ Módulo carregado:', notificationService);

notificationService.enviarEmail(
  'agnesbenites@gmail.com',
  'Teste Compra Smart',
  '<h1>Funcionou!</h1>'
).then(resultado => {
  console.log('✅ RESULTADO:', resultado);
  process.exit(0);
}).catch(erro => {
  console.error('❌ ERRO:', erro);
  process.exit(1);
});