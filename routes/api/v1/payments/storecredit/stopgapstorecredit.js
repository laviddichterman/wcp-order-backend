// some thing relating to payments
const Router = require('express').Router
const moment = require('moment');
const voucher_codes = require('voucher-code-generator');

const { body, validationResult } = require('express-validator');
const SquareProvider = require("../../../../../config/square");
const GoogleProvider = require("../../../../../config/google");

const CreateExternalEmailSender = (EMAIL_ADDRESS, STORE_NAME, payment, sender_email, recipient_name_first, recipient_name_last, credit_code) => {
  const amount = payment.result.payment.total_money.amount / 100;
  const emailbody = `<h2>Thanks for thinking of Windy City Pie and Breezy Town Pizza for someone close to you!</h2>
  <p>We're happy to acknowledge that we've received a payment of \$${amount} for ${recipient_name_first} ${recipient_name_last}'s store credit. <br />
  This gift of store credit never expires and is valid at both Windy City Pie and Breezy Town Pizza locations.<br />
  Store credit can be used when paying online on our website using the code below or in person using the recipient's name and ID. We'll take care of the rest!</p>
  <p>Give ${recipient_name_first} this store credit code: <strong>${credit_code}</strong>.<br />Keep this email in your records and let us know if you have any questions!</p>`;
  GoogleProvider.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    sender_email,
    `Store credit purchase of value \$${amount} for ${recipient_name_first} ${recipient_name_last}.`,
    EMAIL_ADDRESS,
    emailbody);
};

const CreateExternalEmailRecipient = (EMAIL_ADDRESS, STORE_NAME, payment, sender, recipient_name_first, recipient_name_last, recipient_email, additional_message, credit_code) => {
  const amount = payment.result.payment.total_money.amount / 100;
  const sender_message = additional_message && additional_message.length > 0 ? `<p><h3>${sender} wanted us to relay the following to you:</h3><em>${additional_message}</em></p>` : "";
  const emailbody = `<h2>Hey ${recipient_name_first}, ${sender} sent you some digital pizza!</h2>
  <p>This gift of store credit never expires and is valid at both Windy City Pie and Breezy Town Pizza locations. 
  Store credit can be used when paying online on our website using the code below or in person using your name and ID. We'll take care of the rest!</p>
  <p>Credit code: <strong>${credit_code}</strong> valuing <strong>\$${amount}</strong> for ${recipient_name_first} ${recipient_name_last}.<br />Keep this email in your records and let us know if you have any questions!</p>  ${sender_message}`;
  GoogleProvider.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    recipient_email,
    `${recipient_name_first}, you've got store credit to Windy City Pie and Breezy Town Pizza!`,
    EMAIL_ADDRESS,
    emailbody);
}
const AppendToStoreCreditSheet = (STORE_CREDIT_SHEET, payment, recipient, reference_id, credit_code) => {
  const range = "CurrentWARIO!A1:I1";
  const amount = payment.result.payment.total_money.amount / 100;
  const date_added = moment().format("MM/DD/YYYY");
  const fields = [recipient, amount, amount, reference_id, date_added, "WARIO", date_added, credit_code, 0];
  GoogleProvider.AppendToSheet(STORE_CREDIT_SHEET, range, fields);
}

const ValidationChain = [
  body('credit_amount').exists().isFloat({ min: 1, max: 500 }),
  body('sender_name').trim().exists(),
  body('recipient_name_first').trim().exists(),
  body('recipient_name_last').trim().exists(),
  body('sender_email_address').isEmail().exists(),
  body('send_email_to_recipient').toBoolean(true),
  //body('recipient_email_address').isEmail(),
  body('recipient_message').trim()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/storecredit/stopgap', ValidationChain, async (req, res, next) => {
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
      const amount_money = Math.round(req.body.credit_amount * 100);
      const sender_name = req.body.sender_name.replace("&", "and").replace("<", "").replace(">", "");
      const sender_email_address = req.body.sender_email_address;
      const recipient_name_first = req.body.recipient_name_first.replace("&", "and").replace("<", "").replace(">", "");;
      const recipient_name_last = req.body.recipient_name_last.replace("&", "and").replace("<", "").replace(">", "");;
      const recipient_email_address = req.body.recipient_email_address;
      const recipient_message = req.body.recipient_message.replace("&", "and").replace("<", "").replace(">", "");;
      const credit_code = voucher_codes.generate({pattern: "###-##-###"})[0];
      const joint_credit_code = `${credit_code}-${reference_id}`;
      const create_order_response = await SquareProvider.CreateOrderStoreCredit(reference_id, amount_money);
      if (create_order_response.success === true) {
        const square_order_id = create_order_response.response.order.id;
        req.logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${amount_money}`)
        const payment_response = await SquareProvider.ProcessPayment(req.body.nonce, amount_money, reference_id, square_order_id);
        if (payment_response.success === true) {
          CreateExternalEmailSender(EMAIL_ADDRESS, STORE_NAME, payment_response, sender_email_address, recipient_name_first, recipient_name_last, joint_credit_code);
          if (req.body.send_email_to_recipient) {
            CreateExternalEmailRecipient(EMAIL_ADDRESS, STORE_NAME, payment_response, sender_name, recipient_name_first, recipient_name_last, recipient_email_address, recipient_message, joint_credit_code);
          }
          AppendToStoreCreditSheet(STORE_CREDIT_SHEET, payment_response, `${recipient_name_first} ${recipient_name_last}`, reference_id, joint_credit_code);
          req.logger.info(`Store credit code: ${joint_credit_code} and Square Order ID: ${square_order_id} payment for ${amount_money} successful, credit logged to spreadsheet.`)
          return res.status(200).json({reference_id, joint_credit_code, square_order_id, amount_money, payment_response});
        }
        else {
          req.logger.error("Failed to process payment: %o", payment_response);
          const order_cancel_response = await SquareProvider.OrderStateChange(square_order_id, create_order_response.response.order.version, "CANCELED");
          return res.status(400).json(payment_response);
        }
      } else {
        req.logger.error(JSON.stringify(create_order_response));
        return res.status(500).json({ success: false });
      }
    } catch (error) {
      GoogleProvider.SendEmail(
        EMAIL_ADDRESS,
        [EMAIL_ADDRESS, "dave@windycitypie.com"],
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  })