// some thing relating to payments
const Router = require('express').Router
const SquareProvider = require("../../../../config/square");
const GoogleProvider = require("../../../../config/google");

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', async (req, res, next) => {
    try {
      GoogleProvider.SendEmail("laviddichterman@gmail.com", "got me an paymento", "eatpie@windycitypie.com", "GOT EM!");
      SquareProvider.ProcessPayment(req, res);
    } catch (error) {
      next(error)
    }
  })