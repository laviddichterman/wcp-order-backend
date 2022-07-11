// some thing relating to payments
const {WDateUtils} = require("@wcp/wcpshared");
const { parse, format } = require('date-fns'); 
const { body, validationResult } = require('express-validator');
const Router = require('express').Router
const StoreCreditProvider = require("../../../../../config/store_credit_provider");

const GoogleProvider = require("../../../../../config/google");
const { CheckJWT, ScopeEditCredit } = require('../../../../../config/authorization');

const DISPLAY_DATE_FORMAT = "EEEE, MMMM dd, y";

const CreateExternalEmail = async (EMAIL_ADDRESS, STORE_NAME, amount, recipient_name_first, recipient_name_last, recipient_email, credit_code, expiration, qr_code_fs) => {
  const expiration_section = expiration ? `<br />Please note that this credit will expire at 11:59PM on ${format(expiration, DISPLAY_DATE_FORMAT)}.` : "";
  const emailbody = `<h2>You've been sent a discount code from ${STORE_NAME}!</h2>
  <p>Credit code: <strong>${credit_code}</strong> valuing <strong>\$${amount}</strong> for ${recipient_name_first} ${recipient_name_last}.<br />
  <p>Use this discount code when ordering online or in person at either Windy City Pie or Breezy Town Pizza.${expiration_section}</p><br />
  Keep this email in your records and let us know if you have any questions!</p>
  <p>Copy and paste the code above into the "Use Digital Gift Card / Store Credit" field when paying online or, if redeeming in person, show this QR code:<br/> <img src="cid:${credit_code}" /></p>`;
  await GoogleProvider.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    recipient_email,
    `${STORE_NAME} discount code of value \$${amount} for ${recipient_name_first} ${recipient_name_last}.`,
    EMAIL_ADDRESS,
    emailbody,
    [{filename:"qrcode.png", content: qr_code_fs, cid: credit_code}]);
};


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
  .post('/v1/payments/storecredit/discount', CheckJWT, ScopeEditCredit, ValidationChain, async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = req.db.KeyValueConfig.STORE_NAME;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const amount = parseFloat(Number(req.body.amount).toFixed(2));
      const expiration = req.body.expiration ? parse(req.body.expiration, WDateUtils.DATE_STRING_INTERNAL_FORMAT, new Date()) : ""
      const added_by = req.body.added_by;
      const recipient_name_first = req.body.recipient_name_first;
      const recipient_name_last = req.body.recipient_name_last;
      const recipient_email = req.body.recipient_email;
      const reason = req.body.reason;
      const credit_code = StoreCreditProvider.GenerateCreditCode();
      const qr_code_fs = await StoreCreditProvider.GenerateQRCodeFS(credit_code);
      const expiration_formatted = expiration ? format(expiration, WDateUtils.DATE_STRING_INTERNAL_FORMAT) : "";
      await StoreCreditProvider.CreateCreditFromCreditCode(`${recipient_name_first} ${recipient_name_last}`, amount, "DISCOUNT", credit_code, expiration_formatted, added_by, reason);
      await CreateExternalEmail(EMAIL_ADDRESS, STORE_NAME, amount, recipient_name_first, recipient_name_last, recipient_email, credit_code, expiration, qr_code_fs);
      req.logger.info(`Store credit code: ${credit_code} of type DISCOUNT for ${amount} added by ${added_by} for reason: ${reason}.`)
      return res.status(200).json({ credit_code: credit_code });
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