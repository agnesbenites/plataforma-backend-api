// backend/listRoutes.js
const app = require('./app'); // ou seu arquivo principal

function listAllRoutes() {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Rota direta
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      // Rota do router
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  
  console.log('📋 ROTAS DISPONÍVEIS:');
  routes.forEach(route => {
    console.log(`${route.methods.join(', ').toUpperCase()} ${route.path}`);
  });
}

listAllRoutes();