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
  Tip Amount: <strong>${tip_amount}</strong><br />
  Confirm the above values in the <a href="${receipt_url}">receipt</a><br />
  Order ID: ${response.order_id}</p>`;
}

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', async (req, res, next) => {
    try {
      const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
      const STORE_NAME = req.db.KeyValueConfig.STORE_NAME;
      const [response, status] = await SquareProvider.ProcessPayment(req.body);
      if (status === 200) {
        GoogleProvider.SendEmail(
          {
            name: STORE_NAME,
            address: EMAIL_ADDRESS  
          },
          EMAIL_ADDRESS,
          "PAID: " + req.body.email_title, 
          EMAIL_ADDRESS,
          ComposePaymentReceivedEmail(response));
      }
      res.status(status).json(response);
    } catch (error) {
      next(error)
    }
  })