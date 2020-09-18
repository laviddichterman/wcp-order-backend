// some thing relating to payments
const Router = require('express').Router
const moment = require('moment');
const voucher_codes = require('voucher-code-generator');
const wcpshared = require("@wcp/wcpshared");

const { body, validationResult } = require('express-validator');
const GoogleProvider = require("../../../../../config/google");
const { CheckJWT } = require('../../../../../config/authorization');

const DISPLAY_DATE_FORMAT = "dddd, MMMM DD, Y";

const CreateExternalEmail = (EMAIL_ADDRESS, STORE_NAME, amount, recipient_name_first, recipient_name_last, recipient_email, credit_code, expiration) => {
  const expiration_section = expiration ? `<br />Please note that this credit will expire at 11:59PM on ${expiration.format(DISPLAY_DATE_FORMAT)}.` : "";
  const emailbody = `<h2>You've been sent a discount code from ${STORE_NAME}!</h2>
  <p>Use this discount code when ordering online or in person at either Windy City Pie or Breezy Town Pizza.${expiration_section}<br />
  Credit code: <strong>${credit_code}</strong> valuing <strong>\$${amount}</strong> for ${recipient_name_first} ${recipient_name_last}.<br />
  Keep this email in your records and let us know if you have any questions!</p>`;
  GoogleProvider.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    recipient_email,
    `${STORE_NAME} discount code of value \$${amount} for ${recipient_name_first} ${recipient_name_last}.`,
    EMAIL_ADDRESS,
    emailbody);
};

const AppendToStoreCreditSheet = async (STORE_CREDIT_SHEET, amount, recipient, credit_code, added_by, expiration, reason) => {
  const range = "CurrentWARIO!A1:M1";
  const date_added = moment().format(wcpshared.WDateUtils.DATE_STRING_INTERNAL_FORMAT);
  const expiration_str = expiration ? expiration.format(wcpshared.WDateUtils.DATE_STRING_INTERNAL_FORMAT) : "";
  const fields = [recipient, amount, "DISCOUNT", amount, date_added, added_by, date_added, credit_code, expiration_str, reason, "", "", ""];
  await GoogleProvider.AppendToSheet(STORE_CREDIT_SHEET, range, fields);
}

const ValidationChain = [
  body('amount').exists().isFloat({ min: 1, max: 500 }),
  body('recipient_name_first').trim().exists().escape(),
  body('recipient_name_last').trim().exists().escape(),
  body('recipient_email').isEmail(),
  body('expiration').trim(),
  body('added_by').trim().exists().escape(),
  body('reason').trim().exists().escape(),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/storecredit/discount', ValidationChain, CheckJWT, async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = req.db.KeyValueConfig.STORE_NAME;
    const STORE_CREDIT_SHEET = req.db.KeyValueConfig.STORE_CREDIT_SHEET;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        GoogleProvider.SendEmail(
          EMAIL_ADDRESS,
          [EMAIL_ADDRESS, "dave@windycitypie.com"],
          "ERROR IN DISCOUNT CREATION. CONTACT DAVE IMMEDIATELY",
          "dave@windycitypie.com",
          `<p>Request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(errors.array())}</p>`);
        return res.status(422).json({ errors: errors.array() });
      }
      const reference_id = Date.now().toString(36).toUpperCase();
      const amount = parseFloat(Number(req.body.amount).toFixed(2));
      const expiration = req.body.expiration ? moment(req.body.expiration, wcpshared.WDateUtils.DATE_STRING_INTERNAL_FORMAT) : ""
      const added_by = req.body.added_by;
      const recipient_name_first = req.body.recipient_name_first;
      const recipient_name_last = req.body.recipient_name_last;
      const recipient_email = req.body.recipient_email;
      const reason = req.body.reason;
      const credit_code = voucher_codes.generate({pattern: "###-##-###"})[0];
      const joint_credit_code = `${credit_code}-${reference_id}`;
      await AppendToStoreCreditSheet(STORE_CREDIT_SHEET, amount, `${recipient_name_first} ${recipient_name_last}`, joint_credit_code, added_by, expiration, reason);
      CreateExternalEmail(EMAIL_ADDRESS, STORE_NAME, amount, recipient_name_first, recipient_name_last, recipient_email, joint_credit_code, expiration);
      req.logger.info(`Store credit code: ${joint_credit_code} of type DISCOUNT for ${amount} added by ${added_by} for reason: ${reason}.`)
      return res.status(200).json({ credit_code: joint_credit_code });
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