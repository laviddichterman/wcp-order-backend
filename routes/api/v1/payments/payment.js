// some thing relating to payments
const Router = require('express').Router
const SquareProvider = require("../../../../config/square");
const GoogleProvider = require("../../../../config/google");

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', async (req, res, next) => {
    try {
      const retval = SquareProvider.ProcessPayment(req.body);
      if (retval[1] === 200) {
        GoogleProvider.SendEmail("laviddichterman@gmail.com", "got me an paymento", process.env.EMAIL_ADDRESS, "GOT EM!");
      }
      res.status(retval[1]).json(retval[0]);
    } catch (error) {
      next(error)
    }
  })