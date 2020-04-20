// some thing relating to payments
const Router = require('express').Router
const moment = require('moment');
const voucher_codes = require('voucher-code-generator');

const { body, validationResult } = require('express-validator');
const SquareProvider = require("../../../../../config/square");
const GoogleProvider = require("../../../../../config/google");

const CreateExternalEmail = (EMAIL_ADDRESS, STORE_NAME, payment, customer_email, recipient, credit_code) => {
  const amount = payment.result.payment.total_money.amount / 100;
  const emailbody = `<h2>Thanks for thinking of Windy City Pie and Breezy Town Pizza for someone close to you!</h2>
  <p>We're happy to acknowledge that we've received a payment of \$${amount} for ${recipient}.
  Store credit never expires and is valid at both Windy City Pie and Breezy Town Pizza. When redeeming store credit, ${recipient} should present ID. We'll take care of the rest!</p>
  <p>You can also give ${recipient} this store credit code: ${credit_code} for use in the future as we improve our store credit integration.<br />Keep this email in your records and let us know if you have any questions!</p>`;
  GoogleProvider.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    customer_email,
    `Store credit purchase of value \$${amount} for ${recipient}.`,
    EMAIL_ADDRESS,
    emailbody);
};

const AppendToStoreCreditSheet = (STORE_CREDIT_SHEET, payment, recipient, reference_id, credit_code) => {
  const range = "Current!A1:H1";
  const amount = payment.result.payment.total_money.amount / 100;
  const date_added = moment().format("MM/DD/YYYY");
  const fields = [recipient, amount, amount, reference_id, date_added, "WARIO", date_added, credit_code];
  GoogleProvider.AppendToSheet(STORE_CREDIT_SHEET, range, fields);
}

const ValidationChain = [
  body('amount_money').exists().isInt({ min: 0, max: 500 }),
  body('recipient_name').trim().exists(),
  body('user_email').isEmail().exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/storecredit/stopgap', async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = req.db.KeyValueConfig.STORE_NAME;
    const STORE_CREDIT_SHEET = req.db.KeyValueConfig.STORE_CREDIT_SHEET;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        GoogleProvider.SendEmail(
          EMAIL_ADDRESS,
          [EMAIL_ADDRESS, "dave@windycitypie.com"],
          "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
          "dave@windycitypie.com",
          `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(errors.array())}</p>`);
        return res.status(422).json({ errors: errors.array() });
      }
      const reference_id = Date.now().toString(36).toUpperCase();
      const amount_money = Math.round(req.body.amount_money * 100);
      const customer_email = req.body.customer_email;
      const recipient_name = req.body.recipient_name;
      const credit_code = voucher_codes.generate({pattern: "###-##-###"});
      const create_order_response = await SquareProvider.CreateOrderStoreCredit(reference_id, amount_money);
      if (create_order_response.success === true) {
        const square_order_id = create_order_response.response.order.id;
        req.logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${amount_money}`)
        const payment_response = await SquareProvider.ProcessPayment(req.body.nonce, amount_money, reference_id, square_order_id);
        if (!payment_response.success) {
          req.logger.error("Failed to process payment: %o", payment_response);
          const order_cancel_response = await SquareProvider.OrderStateChange(square_order_id, create_order_response.response.order.version, "CANCELED");
          res.status(400).json(payment_response);
        }
        else {
          CreateExternalEmail(EMAIL_ADDRESS, STORE_NAME, payment_response, customer_email, recipient_name, credit_code);
          AppendToStoreCreditSheet(STORE_CREDIT_SHEET, payment_response, recipient_name, reference_id, credit_code);
          req.logger.info(`For internal id ${reference_id} with store credit code: ${credit_code} and Square Order ID: ${square_order_id} payment for ${amount_money} successful, credit logged to spreadsheet.`)
          res.status(200).json({reference_id, credit_code, square_order_id, amount_money, payment_response});
        }
      } else {
        req.logger.error(JSON.stringify(create_order_response));
        res.status(500).json({ success: false });
      }
    } catch (error) {
      GoogleProvider.SendEmail(
        EMAIL_ADDRESS,
        [EMAIL_ADDRESS, "dave@windycitypie.com"],
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(errors.array())}</p>`);
      next(error)
    }
  })