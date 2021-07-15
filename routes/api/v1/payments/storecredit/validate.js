// some thing relating to payments
const Router = require('express').Router
const moment = require('moment');
const { query, validationResult } = require('express-validator');
const GoogleProvider = require("../../../../../config/google");
const StoreCreditProvider = require("../../../../config/store_credit_provider");

const ValidationChain = [
  query('code').exists().isLength({min: 19, max: 19})
];

module.exports = Router({ mergeParams: true })
  .get('/v1/payments/storecredit/validate', ValidationChain, async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const credit_code = req.query.code;
      const validate_response = await StoreCreditProvider.ValidateAndLockCode(credit_code);
      if (validate_response.valid) {
        req.logger.info(`Found and locked ${credit_code} with value ${amount}.`);
        return res.status(200).json({enc: validate_response.lock.enc, 
          iv: validate_response.lock.iv.toString('hex'), 
          auth: validate_response.lock.auth.toString('hex'), 
          validated: validate_response.valid, 
          amount: validate_response.balance, 
          credit_type: validate_response.type});
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