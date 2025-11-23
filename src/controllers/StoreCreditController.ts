import { Router, Request, Response, NextFunction } from 'express';
import validationMiddleware from '../middleware/validationMiddleware';
import logger from '../logging';

import { DataProviderInstance } from '../config/dataprovider';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeEditCredit } from '../config/authorization';
import { StoreCreditProviderInstance } from '../config/store_credit_provider';
import { GoogleProviderInstance } from '../config/google';

import { SpendCreditResponse, ValidateLockAndSpendRequest, CURRENCY, IssueStoreCreditRequest, StoreCreditType, PurchaseStoreCreditRequest, MoneyToDisplayString } from '@wcp/wario-shared';
import { BigIntStringify } from '../utils';
import { CreditCodeQuery, PurchaseStoreCreditDto, IssueStoreCreditDto, SpendStoreCreditDto } from '../dto/payment/StoreCreditDtos';

export class StoreCreditController implements IExpressController{
  public path = "/api/v1/payments/storecredit";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // todo: move /validate endpoint to ./
    this.router.get(`${this.path}/validate`, validationMiddleware(CreditCodeQuery, { source: 'query' }), this.getValidateCredit);
    this.router.post(`${this.path}/spend`, validationMiddleware(SpendStoreCreditDto), this.postSpendCredit);
    this.router.post(`${this.path}/purchase`, validationMiddleware(PurchaseStoreCreditDto), this.postPurchaseCredit);
    this.router.post(`${this.path}/issue`, CheckJWT, ScopeEditCredit, validationMiddleware(IssueStoreCreditDto), this.postIssueCredit);  };

  private getValidateCredit = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const credit_code = req.query.code as string;
      const validate_response = await StoreCreditProviderInstance.ValidateAndLockCode(credit_code);
      if (validate_response.valid && validate_response.amount.amount > 0) {
        logger.info(`Found and locked ${credit_code} with value ${MoneyToDisplayString(validate_response.amount, true)}.`);
        return res.status(200).json(validate_response);
      }
      else {
        logger.info(`Failed to find ${credit_code}`);
        return res.status(404).json(validate_response);
      }
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${BigIntStringify(req.query)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      return next(error)
    }
  }

  private postSpendCredit = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const typedRequest : ValidateLockAndSpendRequest = req.body; 
      const spending_result = await StoreCreditProviderInstance.ValidateLockAndSpend(typedRequest);
      if (!spending_result.success) {
        return res.status(422).json({success: false} satisfies SpendCreditResponse);
      }
      return res.status(200).json({success: true, balance: { currency: CURRENCY.USD, amount: (spending_result.entry[3] * 100) - typedRequest.amount.amount } } satisfies SpendCreditResponse)
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${BigIntStringify(req.body)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      return next(error)
    }
  }

  private postPurchaseCredit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const nonce = req.body.nonce;
      const typedRequest: PurchaseStoreCreditRequest = {
        amount: req.body.amount,
        recipientEmail: req.body.recipientEmail,
        recipientNameFirst: req.body.recipientNameFirst,
        recipientNameLast: req.body.recipientNameLast,
        senderName: req.body.senderName,
        senderEmail: req.body.senderEmail,
        sendEmailToRecipient: req.body.sendEmailToRecipient,
        recipientMessage: req.body.recipientMessage
      };
      const result = await StoreCreditProviderInstance.PurchaseStoreCredit(typedRequest, nonce);
      return res.status(result.status).json(result);
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS,
        { name: DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${BigIntStringify(req.body)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      return next(error)
    }
  }
  private postIssueCredit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const typedRequest: IssueStoreCreditRequest = {
        addedBy: req.body.addedBy,
        amount: req.body.amount,
        creditType: req.body.creditType,
        reason: req.body.reason,
        recipientEmail: req.body.recipientEmail,
        recipientNameFirst: req.body.recipientNameFirst,
        recipientNameLast: req.body.recipientNameLast,
        expiration: req.body.expiration ? req.body.expiration : null
      }
      const result = await StoreCreditProviderInstance.IssueCredit(typedRequest);
      return res.status(result.status).json({ credit_code: result.credit_code });
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS,
        { name: DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${BigIntStringify(req.body)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      return next(error)
    }
  }
}