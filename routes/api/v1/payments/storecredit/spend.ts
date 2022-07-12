// some thing relating to payments
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult }  from 'express-validator';
import StoreCreditProviderInstance from "../../../../../config/store_credit_provider";
import GoogleProviderInstance from "../../../../../config/google";
import DataProviderInstance from '../../../../../config/dataprovider';

const ValidationChain = [
  body('code').exists().isLength({min: 19, max: 19}),
  body('amount').exists().isFloat({min: 0.01}),
  body('processed_by').exists(),
  body('lock.enc').exists(),
  body('lock.iv').exists(),
  body('lock.auth').exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/storecredit/spend', ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const spending_result = await StoreCreditProviderInstance.ValidateLockAndSpend(req.body.code, req.body.lock, req.body.amount, req.body.processed_by);
      if (!spending_result.success) {
        return res.status(422).json({success: false, result: {errors: [{detail: "Unable to debit store credit."}]} });
      }
      return res.status(200).json({success: true, balance: spending_result.entry[3]-req.body.amount})
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  })