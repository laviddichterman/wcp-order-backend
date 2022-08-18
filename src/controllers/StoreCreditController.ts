import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import logger from '../logging';

import DataProviderInstance from '../config/dataprovider';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeEditCredit } from '../config/authorization';
import StoreCreditProviderInstance from '../config/store_credit_provider';
import GoogleProviderInstance from '../config/google';
import SquareProviderInstance from '../config/square';
import internal, { Stream } from 'stream';
import { format, parseISO } from 'date-fns';
import { SpendCreditResponse, WDateUtils, ValidateLockAndSpendRequest, CURRENCY, IssueStoreCreditRequest, StoreCreditType, MoneyToDisplayString, PurchaseStoreCreditRequest } from '@wcp/wcpshared';
import { BigIntStringify } from '../utils';

const CreditCodeValidationChain = [
  query('code').exists().isLength({min: 19, max: 19})
];

const PurchaseStoreCreditValidationChain = [
  body('amount.amount').isInt({ min: 100, max: 200000 }).exists(),
  body('amount.currency').exists().isIn(Object.values(CURRENCY)),
  body('senderName').trim().exists(),
  body('senderEmail').isEmail().exists(),
  body('recipientNameFirst').trim().exists().escape(),
  body('recipientNameLast').trim().exists().escape(),
  body('recipientEmail').optional().isEmail(),
  body('sendEmailToRecipient').toBoolean(true),
  body('recipientMessage').trim()
];

const SpendStoreCreditValidationChain = [
  body('code').exists().isLength({min: 19, max: 19}),
  body('amount').exists().isFloat({min: 0.01}),
  body('updatedBy').exists(),
  body('lock.enc').exists().isString(),
  body('lock.iv').exists().isString(),
  body('lock.auth').exists().isString()
];

const IssueStoreCreditValidationChain = [
  body('amount.amount').isInt({ min: 100, max: 50000 }).exists(),
  body('amount.currency').exists().isIn(Object.values(CURRENCY)),
  body('recipientNameFirst').trim().exists().escape(),
  body('recipientNameLast').trim().exists().escape(),
  body('recipientEmail').isEmail(),
  body('creditType').trim().exists().isIn(Object.keys(StoreCreditType)),
  body('expiration').optional().isDate({format:'YYYYMMDD'}),
  body('addedBy').trim().exists().escape(),
  body('reason').trim().exists().escape(),
];

const CreateExternalEmailSender = async ({amount, senderEmail, recipientNameFirst, recipientNameLast} : Pick<PurchaseStoreCreditRequest, 'amount' | 'senderEmail' | 'recipientNameFirst' | 'recipientNameLast'>, creditCode : string, qr_code_fs : internal.PassThrough) => {
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const amountString = MoneyToDisplayString(amount, true);
  const recipient = `${recipientNameFirst} ${recipientNameLast}`;
  const emailbody = `<h2>Thanks for thinking of Windy City Pie and Breezy Town Pizza for someone close to you!</h2>
  <p>We're happy to acknowledge that we've received a payment of ${amountString} for ${recipient}'s store credit. <br />
  This gift of store credit never expires and is valid at both Windy City Pie and Breezy Town Pizza locations.<br />
  Store credit can be used when paying online on our website by copy/pasting the code below or in person using the QR code below. We'll take care of the rest!</p>
  <p>Give ${recipientNameFirst} this store credit code: <strong>${creditCode}</strong> and this QR code: <br/> <img src="cid:${creditCode}" /></p>
  <p>Keep this email in your records and let us know if you have any questions!</p>`;
  await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    senderEmail,
    `Store credit purchase of value ${amountString} for ${recipient}.`,
    EMAIL_ADDRESS,
    emailbody,
    [{filename:"qrcode.png", content: qr_code_fs, cid: creditCode}]);
};

const CreateExternalEmailRecipient = async ({amount, senderName, recipientNameFirst, recipientNameLast, recipientEmail, recipientMessage}: PurchaseStoreCreditRequest, creditCode : string, qr_code_fs : internal.PassThrough) => {
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const amountString = MoneyToDisplayString(amount, true);
  const recipient = `${recipientNameFirst} ${recipientNameLast}`;
  const sender_message = recipientMessage && recipientMessage.length > 0 ? `<p><h3>${senderName} wanted us to relay the following to you:</h3><em>${recipientMessage}</em></p>` : "";
  const emailbody = `<h2>Hey ${recipientNameFirst}, ${senderName} sent you some digital pizza!</h2>
  <p>This gift of store credit never expires and is valid at both Windy City Pie and Breezy Town Pizza locations.<br />
  Store credit can be used when paying online on our website by copy/pasting the code below into the "Use Digital Gift Card / Store Credit" field or, in person by showing the QR code at the bottom of this email. We'll take care of the rest!</p>
  <p>Credit code: <strong>${creditCode}</strong> valuing <strong>${amountString}</strong> for ${recipient}.<br />Keep this email in your records and let us know if you have any questions!</p>  ${sender_message}
  <p>QR code for in-person redemption: <br/> <img src="cid:${creditCode}" /></p>`;
  await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    recipientEmail,
    `${recipientNameFirst}, you've got store credit to Windy City Pie and Breezy Town Pizza!`,
    EMAIL_ADDRESS,
    emailbody,
    [{filename:"qrcode.png", content: qr_code_fs, cid: creditCode}]);
}

const CreateExternalEmail = async ({ amount, recipientNameFirst, recipientNameLast, recipientEmail, expiration} : IssueStoreCreditRequest, creditCode : string, qr_code_fs : internal.PassThrough) => {
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const amountString = MoneyToDisplayString(amount, true);
  const recipient = `${recipientNameFirst} ${recipientNameLast}`;
  const expiration_section = expiration ? `<br />Please note that this credit will expire at 11:59PM on ${format(parseISO(expiration), WDateUtils.ServiceDateDisplayFormat)}.` : "";
  const emailbody = `<h2>You've been sent a discount code from ${STORE_NAME}!</h2>
  <p>Credit code: <strong>${creditCode}</strong> valuing <strong>${amountString}</strong> for ${recipient}.<br />
  <p>Use this discount code when ordering online or in person at either Windy City Pie or Breezy Town Pizza.${expiration_section}</p><br />
  Keep this email in your records and let us know if you have any questions!</p>
  <p>Copy and paste the code above into the "Use Digital Gift Card / Store Credit" field when paying online or, if redeeming in person, show this QR code:<br/> <img src="cid:${creditCode}" /></p>`;
  await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    recipientEmail,
    `${STORE_NAME} discount code of value ${amountString} for ${recipient}.`,
    EMAIL_ADDRESS,
    emailbody,
    [{filename:"qrcode.png", content: qr_code_fs, cid: creditCode}]);
};



export class StoreCreditController implements IExpressController {
  public path = "/api/v1/payments/storecredit";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // todo: move /validate endpoint to ./
    this.router.get(`${this.path}/validate`, expressValidationMiddleware(CreditCodeValidationChain), this.getValidateCredit);
    this.router.post(`${this.path}/spend`, expressValidationMiddleware(SpendStoreCreditValidationChain), this.postSpendCredit);
    this.router.post(`${this.path}/stopgap`, expressValidationMiddleware(PurchaseStoreCreditValidationChain), this.postPurchaseCredit);
    this.router.post(`${this.path}/discount`, CheckJWT, ScopeEditCredit, expressValidationMiddleware(IssueStoreCreditValidationChain), this.postIssueCredit);
  };

  private getValidateCredit = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const credit_code = req.query.code as string;
      const validate_response = await StoreCreditProviderInstance.ValidateAndLockCode(credit_code);
      if (validate_response.valid) {
        logger.info(`Found and locked ${credit_code} with value ${validate_response.amount}.`);
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
      next(error)
    }
  }

  private postSpendCredit = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const typedRequest : ValidateLockAndSpendRequest = req.body; 
      const spending_result = await StoreCreditProviderInstance.ValidateLockAndSpend(typedRequest);
      if (!spending_result.success) {
        return res.status(422).json({success: false} as SpendCreditResponse);
      }
      return res.status(200).json({success: true, balance: spending_result.entry[3]-req.body.amount} as SpendCreditResponse)
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${BigIntStringify(req.body)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      next(error)
    }
  }

  private postPurchaseCredit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reference_id = Date.now().toString(36).toUpperCase();
      const nonce = req.body.nonce;
      const typedRequest: PurchaseStoreCreditRequest = {
        amount: req.body.amount,
        addedBy: DataProviderInstance.KeyValueConfig.STORE_NAME,
        recipientEmail: req.body.recipientEmail,
        recipientNameFirst: req.body.recipientNameFirst,
        recipientNameLast: req.body.recipientNameLast,
        senderName: req.body.senderName,
        senderEmail: req.body.senderEmail,
        sendEmailToRecipient: req.body.sendEmailToRecipient,
        recipientMessage: req.body.recipientMessage
      };
      const amountString = MoneyToDisplayString(typedRequest.amount, true);
      const creditCode = StoreCreditProviderInstance.GenerateCreditCode();
      const qr_code_fs = await StoreCreditProviderInstance.GenerateQRCodeFS(creditCode);
      const qr_code_fs_a = new Stream.PassThrough();
      const qr_code_fs_b = new Stream.PassThrough();
      qr_code_fs.pipe(qr_code_fs_a);
      qr_code_fs.pipe(qr_code_fs_b);
      const create_order_response = await SquareProviderInstance.CreateOrderStoreCredit(reference_id, typedRequest.amount, `Purchase of store credit code: ${creditCode}`);
      if (create_order_response.success === true) {
        const square_order_id = create_order_response.result.order.id;
        logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${amountString}`)
        const payment_response = await SquareProviderInstance.ProcessPayment(nonce, typedRequest.amount, reference_id, square_order_id);
        if (payment_response.success === true) {
          CreateExternalEmailSender(typedRequest, creditCode, qr_code_fs_a);
          if (req.body.send_email_to_recipient) {
            CreateExternalEmailRecipient(typedRequest, creditCode, qr_code_fs_b);
          }
          
          await StoreCreditProviderInstance.CreateCreditFromCreditCode({...typedRequest, addedBy: 'WARIO',reason: "website purchase", creditType: StoreCreditType.MONEY, creditCode, expiration: null})
          logger.info(`Store credit code: ${creditCode} and Square Order ID: ${square_order_id} payment for ${amountString} successful, credit logged to spreadsheet.`)
          return res.status(200).json({reference_id, 
            joint_credit_code: creditCode, 
            square_order_id, 
            amount_money: Number(payment_response.result.amount.amount), 
            last4: payment_response.result.last4, 
            receipt_url: payment_response.result.receiptUrl
          });
        }
        else {
          logger.error("Failed to process payment: %o", payment_response);
          await SquareProviderInstance.OrderStateChange(square_order_id, create_order_response.result.order.version + 1, "CANCELED");
          return res.status(400).json(payment_response);
        }
      } else {
        logger.error(BigIntStringify(create_order_response));
        return res.status(500).json(create_order_response);
      }
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS,
        { name: DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${BigIntStringify(req.body)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      next(error)
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
      const amountAsString = MoneyToDisplayString(req.body.amount, true);
      const creditCode = StoreCreditProviderInstance.GenerateCreditCode();
      const qr_code_fs = await StoreCreditProviderInstance.GenerateQRCodeFS(creditCode);
      await StoreCreditProviderInstance.CreateCreditFromCreditCode({...typedRequest, creditCode });
      await CreateExternalEmail(typedRequest, creditCode, qr_code_fs);
      logger.info(`Store credit code: ${creditCode} of type DISCOUNT for ${amountAsString} added by ${typedRequest.addedBy} for reason: ${typedRequest.reason}.`)
      return res.status(200).json({ credit_code: creditCode });
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS,
        { name: DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${BigIntStringify(req.body)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      next(error)
    }
  }
}