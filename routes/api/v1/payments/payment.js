// some thing relating to payments
const Router = require('express').Router
const SquareProvider = require("../../../../config/square");

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', async (req, res, next) => {
    try {
      SquareProvider.ProcessPayment(req, res);
    } catch (error) {
      next(error)
    }
  })