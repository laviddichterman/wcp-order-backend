// some thing relating to payments
const Router = require('express').Router
const SquareProvider = require("../../../../config/square");
const GoogleProvider = require("../../../../config/google");

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', async (req, res, next) => {
    try {
      const [response, code] = SquareProvider.ProcessPayment(req.body);
      if (code === 200) {
        GoogleProvider.SendEmail("laviddichterman@gmail.com", "got me an paymento", process.env.EMAIL_ADDRESS, "GOT EM!");
      }
      res.status(code).json(response);
    } catch (error) {
      next(error)
    }
  })