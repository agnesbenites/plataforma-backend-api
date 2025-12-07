// api-backend/routes/index.js

const stripeConnectRoutes = require('./stripeConnect.routes.js');
const paymentRoutes = require('./payment.routes.js');

module.exports = {
  stripeConnectRoutes,
  paymentRoutes
};