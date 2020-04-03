// some thing relating to payments
const Router = require('express').Router
const SquareProvider = require("../../../../config/square");

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', async (req, res, next) => {
    try {
      const [response, status] = await SquareProvider.ProcessPayment(req.body);
      if (status === 200) {
        req.logger.info("Successfully processed payment: %o", response);
      }
      res.status(status).json(response);
    } catch (error) {
      next(error)
    }
  })