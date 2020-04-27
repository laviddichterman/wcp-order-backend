// some thing relating to payments
const Router = require('express').Router
const moment = require('moment');
const aes256gcm = require('../../../../../config/crypto-aes-256-gcm');
const { query, validationResult } = require('express-validator');
const GoogleProvider = require("../../../../../config/google");


const ValidateAndLock = async (STORE_CREDIT_SHEET, credit_code, enc, iv, auth) => {
  const range = "CurrentWARIO!A2:K";
  const values = await GoogleProvider.GetValuesFromSheet(STORE_CREDIT_SHEET, range);
  for (let i = 0; i < values.values.length; ++i) {
    const entry = values.values[i];
    if (entry[7] == credit_code) {
      const date_modified = moment().format("MM/DD/YYYY");
      const new_entry = [entry[0], entry[1], entry[2], entry[3], entry[4], "WARIO", date_modified, entry[7], enc, iv.toString('hex'), auth.toString('hex')];
      const new_range = `CurrentWARIO!${2 + i}:${2 + i}`;
      GoogleProvider.UpdateValuesInSheet(STORE_CREDIT_SHEET, new_range, new_entry);
      return [true, entry[2], parseFloat(Number(entry[3]).toFixed(2))];
    }
  }
  return [false, 0];
}

const ValidationChain = [
  query('code').exists().isLength({min: 19, max: 19})
];

module.exports = Router({ mergeParams: true })
  .get('/v1/payments/storecredit/validate', ValidationChain, async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_CREDIT_SHEET = req.db.KeyValueConfig.STORE_CREDIT_SHEET;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        GoogleProvider.SendEmail(
          EMAIL_ADDRESS,
          [EMAIL_ADDRESS, "dave@windycitypie.com"],
          "ERROR IN GIFT CARD VALIDATION. CONTACT DAVE IMMEDIATELY",
          "dave@windycitypie.com",
          `<p>Request: ${JSON.stringify(req.query)}</p><p>Error info:${JSON.stringify(errors.array())}</p>`);
        return res.status(422).json({ errors: errors.array() });
      }
      const credit_code = req.query.code;
      // TODO: remove dashes from credit code
      const [enc, iv, auth] = aes256gcm.encrypt(credit_code);
      const [validated, credit_type, amount] = await ValidateAndLock(STORE_CREDIT_SHEET, credit_code, enc, iv, auth);
      if (validated) {
        req.logger.info(`Found and locked ${credit_code} with value ${amount}.`);
        return res.status(200).json({enc, iv: iv.toString('hex'), auth: auth.toString('hex'), validated, amount, credit_type});
      }
      else {
        req.logger.info(`Failed to find ${credit_code}`);
        return res.status(404).json({validated: false});
      }
    } catch (error) {
      GoogleProvider.SendEmail(
        EMAIL_ADDRESS,
        [EMAIL_ADDRESS, "dave@windycitypie.com"],
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${JSON.stringify(req.query)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  })