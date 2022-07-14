// some thing relating to payments
import { Router, Request, Response, NextFunction } from 'express';
import { query, validationResult } from 'express-validator';
import GoogleProvider from "../../../../../config/google";
import StoreCreditProvider from "../../../../../config/store_credit_provider";
import DataProviderInstance from '../../../../../config/dataprovider';
import logger from '../../../../../logging';

const ValidationChain = [
  query('code').exists().isLength({min: 19, max: 19})
];

module.exports = Router({ mergeParams: true })
  .get('/v1/payments/storecredit/validate', ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const credit_code = req.query.code as string;
      const validate_response = await StoreCreditProvider.ValidateAndLockCode(credit_code);
      if (validate_response.valid && validate_response.balance > 0) {
        logger.info(`Found and locked ${credit_code} with value ${validate_response.balance}.`);
        return res.status(200).json({enc: validate_response.lock.enc, 
          iv: validate_response.lock.iv.toString('hex'), 
          auth: validate_response.lock.auth.toString('hex'), 
          validated: validate_response.valid, 
          amount: validate_response.balance, 
          credit_type: validate_response.type});
      }
      else {
        logger.info(`Failed to find ${credit_code}`);
        return res.status(404).json({validated: false});
      }
    } catch (error) {
      GoogleProvider.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${JSON.stringify(req.query)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  })