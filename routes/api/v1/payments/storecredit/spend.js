// some thing relating to payments
const Router = require('express').Router
const moment = require('moment');
const { body, validationResult } = require('express-validator');
const StoreCreditProvider = require("../../../../../config/store_credit_provider");
const GoogleProvider = require("../../../../../config/google");
const wcpshared = require("@wcp/wcpshared");

const ValidateAndLock = async (STORE_CREDIT_SHEET, credit_code, enc, iv, auth) => {
  const range = "CurrentWARIO!A2:M";
  const values = await GoogleProvider.GetValuesFromSheet(STORE_CREDIT_SHEET, range);
  for (let i = 0; i < values.values.length; ++i) {
    const entry = values.values[i];
    if (entry[7] == credit_code) {
      const date_modified = moment().format(wcpshared.WDateUtils.DATE_STRING_INTERNAL_FORMAT);
      const new_entry = [entry[0], entry[1], entry[2], entry[3], entry[4], entry[5], date_modified, entry[7], entry[8], entry[9], enc, iv.toString('hex'), auth.toString('hex')];
      const new_range = `CurrentWARIO!${2 + i}:${2 + i}`;
      GoogleProvider.UpdateValuesInSheet(STORE_CREDIT_SHEET, new_range, new_entry);
      const expiration = entry[8] ? moment(entry[8], wcpshared.WDateUtils.DATE_STRING_INTERNAL_FORMAT) : null;
      return [expiration === null || !expiration.isValid() || expiration.isSameOrAfter(moment(), "day"), entry[2], parseFloat(Number(entry[3]).toFixed(2))];
    }
  }
  return [false, "MONEY", 0, ""];
}

const ValidationChain = [
  body('code').exists().isLength({min: 19, max: 19}),
  body('amount').exists().isFloat({min: 0.01}),
  body('lock.env').exists(),
  body('lock.iv').exists(),
  body('lock.auth').exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/storecredit/spend', ValidationChain, async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const spending_result = await StoreCreditProvider.ValidateLockAndSpend(req.body.code, req.body.lock, req.body.amount);
      if (!spending_result.success) {
        return res.status(404).json({success: false, result: {errors: [{detail: "Unable to debit store credit."}]} });
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