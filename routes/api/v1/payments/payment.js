// some thing relating to payments
const Router = require('express').Router
const SquareProvider = require("../../../../config/square");
const GoogleProvider = require("../../../../config/google");

const ComposePaymentReceivedEmail = (response) => {
  const base_amount = "$" + response.result.payment.amount_money.amount / 100;
  const tip_amount = "$" + response.result.payment.tip_money.amount / 100;
  const total_amount = "$" + response.result.payment.total_money.amount / 100;
  const receipt_url = response.result.payment.receipt_url;
  return `<p>Received payment of: <strong>${total_amount}</strong></p>
  <p>Base Amount: <strong>${base_amount}</strong><br />
  <p>Tip Amount: <strong>${tip_amount}</strong><br />
  <p>Confirm the above values in the <a href="${response.result.payment.receipt_url}">receipt</a></p>
  <p>Order ID: ${response.order_id}</p>`;
}

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', async (req, res, next) => {
    try {
      const [response, status] = await SquareProvider.ProcessPayment(req.body);
      if (status === 200) {
        GoogleProvider.SendEmail(
          process.env.EMAIL_ADDRESS, // from
          process.env.EMAIL_ADDRESS, // to
          "PAID: " + decodeURIComponent(req.body.email_title), 
          process.env.EMAIL_ADDRESS, // replyto
          ComposePaymentReceivedEmail(response));
      }
      res.status(status).json(response);
    } catch (error) {
      next(error)
    }
  })