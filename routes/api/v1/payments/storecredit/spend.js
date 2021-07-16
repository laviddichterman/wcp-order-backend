// some thing relating to payments
const Router = require('express').Router
const { body, validationResult } = require('express-validator');
const StoreCreditProvider = require("../../../../../config/store_credit_provider");
const GoogleProvider = require("../../../../../config/google");

const ValidationChain = [
  body('code').exists().isLength({min: 19, max: 19}),
  body('amount').exists().isFloat({min: 0.01}),
  body('lock.enc').exists(),
  body('lock.iv').exists(),
  body('lock.auth').exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/storecredit/spend', ValidationChain, async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = req.db.KeyValueConfig.STORE_NAME;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const spending_result = await StoreCreditProvider.ValidateLockAndSpend(req.body.code, req.body.lock, req.body.amount, STORE_NAME);
      if (!spending_result.success) {
        return res.status(422).json({success: false, result: {errors: [{detail: "Unable to debit store credit."}]} });
      }
      return res.status(200).json({success: true, balance: spending_result.entry[3]-req.body.amount})
    } catch (error) {
      GoogleProvider.SendEmail(
        EMAIL_ADDRESS,
        [EMAIL_ADDRESS, "dave@windycitypie.com"],
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  })