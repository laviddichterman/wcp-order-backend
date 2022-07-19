import { Router, Request, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import logger from '../logging';

import DataProviderInstance from '../config/dataprovider';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeEditCredit } from '../config/authorization';
import StoreCreditProviderInstance from '../config/store_credit_provider';
import GoogleProviderInstance from '../config/google';
import SquareProviderInstance from '../config/square';
import internal, { Stream } from 'stream';
import { format, parse } from 'date-fns';
import { WDateUtils } from '@wcp/wcpshared';

const CreditCodeValidationChain = [
  query('code').exists().isLength({min: 19, max: 19})
];

const PurchaseStoreCreditValidationChain = [
  body('credit_amount').exists().isFloat({ min: 1, max: 2000 }),
  body('sender_name').trim().exists(),
  body('recipient_name_first').trim().exists(),
  body('recipient_name_last').trim().exists(),
  body('sender_email_address').isEmail().exists(),
  body('send_email_to_recipient').toBoolean(true),
  //body('recipient_email_address').isEmail(),
  body('recipient_message').trim()
];

const SpendStoreCreditValidationChain = [
  body('code').exists().isLength({min: 19, max: 19}),
  body('amount').exists().isFloat({min: 0.01}),
  body('processed_by').exists(),
  body('lock.enc').exists(),
  body('lock.iv').exists(),
  body('lock.auth').exists()
];

const IssueStoreCreditValidationChain = [
  body('amount').exists().isFloat({ min: 1, max: 500 }),
  body('recipient_name_first').trim().exists().escape(),
  body('recipient_name_last').trim().exists().escape(),
  //body('credit_type').trim().exists().isIn(['MONEY', 'DISCOUNT']),
  body('recipient_email').isEmail(),
  body('expiration').trim(),
  body('added_by').trim().exists().escape(),
  body('reason').trim().exists().escape(),
];

const CreateExternalEmailSender = async (EMAIL_ADDRESS : string, STORE_NAME: string, amount : string, sender_email : string, recipient_name_first : string, recipient_name_last : string, credit_code : string, qr_code_fs : internal.PassThrough) => {
  const emailbody = `<h2>Thanks for thinking of Windy City Pie and Breezy Town Pizza for someone close to you!</h2>
  <p>We're happy to acknowledge that we've received a payment of \$${amount} for ${recipient_name_first} ${recipient_name_last}'s store credit. <br />
  This gift of store credit never expires and is valid at both Windy City Pie and Breezy Town Pizza locations.<br />
  Store credit can be used when paying online on our website by copy/pasting the code below or in person using the QR code below. We'll take care of the rest!</p>
  <p>Give ${recipient_name_first} this store credit code: <strong>${credit_code}</strong> and this QR code: <br/> <img src="cid:${credit_code}" /></p>
  <p>Keep this email in your records and let us know if you have any questions!</p>`;
  await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    sender_email,
    `Store credit purchase of value \$${amount} for ${recipient_name_first} ${recipient_name_last}.`,
    EMAIL_ADDRESS,
    emailbody,
    [{filename:"qrcode.png", content: qr_code_fs, cid: credit_code}]);
};

const CreateExternalEmailRecipient = async (EMAIL_ADDRESS : string, STORE_NAME : string, amount : string, sender : string, recipient_name_first : string, recipient_name_last : string, recipient_email : string, additional_message: string, credit_code : string, qr_code_fs : internal.PassThrough) => {
  const sender_message = additional_message && additional_message.length > 0 ? `<p><h3>${sender} wanted us to relay the following to you:</h3><em>${additional_message}</em></p>` : "";
  const emailbody = `<h2>Hey ${recipient_name_first}, ${sender} sent you some digital pizza!</h2>
  <p>This gift of store credit never expires and is valid at both Windy City Pie and Breezy Town Pizza locations.<br />
  Store credit can be used when paying online on our website by copy/pasting the code below into the "Use Digital Gift Card / Store Credit" field or, in person by showing the QR code at the bottom of this email. We'll take care of the rest!</p>
  <p>Credit code: <strong>${credit_code}</strong> valuing <strong>\$${amount}</strong> for ${recipient_name_first} ${recipient_name_last}.<br />Keep this email in your records and let us know if you have any questions!</p>  ${sender_message}
  <p>QR code for in-person redemption: <br/> <img src="cid:${credit_code}" /></p>`;
  await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    recipient_email,
    `${recipient_name_first}, you've got store credit to Windy City Pie and Breezy Town Pizza!`,
    EMAIL_ADDRESS,
    emailbody,
    [{filename:"qrcode.png", content: qr_code_fs, cid: credit_code}]);
}

const DISPLAY_DATE_FORMAT = "EEEE, MMMM dd, y";

const CreateExternalEmail = async (EMAIL_ADDRESS : string, STORE_NAME: string, amount : string, recipient_name_first: string, recipient_name_last: string, recipient_email : string, credit_code : string , expiration : Date | null, qr_code_fs : internal.PassThrough) => {
  const expiration_section = expiration ? `<br />Please note that this credit will expire at 11:59PM on ${format(expiration, DISPLAY_DATE_FORMAT)}.` : "";
  const emailbody = `<h2>You've been sent a discount code from ${STORE_NAME}!</h2>
  <p>Credit code: <strong>${credit_code}</strong> valuing <strong>\$${amount}</strong> for ${recipient_name_first} ${recipient_name_last}.<br />
  <p>Use this discount code when ordering online or in person at either Windy City Pie or Breezy Town Pizza.${expiration_section}</p><br />
  Keep this email in your records and let us know if you have any questions!</p>
  <p>Copy and paste the code above into the "Use Digital Gift Card / Store Credit" field when paying online or, if redeeming in person, show this QR code:<br/> <img src="cid:${credit_code}" /></p>`;
  await GoogleProviderInstance.SendEmail(
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



export class StoreCreditController implements IExpressController {
  public path = "/api/v1/payments/storecredit";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // todo: move /validate endpoint to ./
    this.router.get(`${this.path}/validate`, CreditCodeValidationChain, this.getValidateCredit);
    this.router.post(`${this.path}/spend`, SpendStoreCreditValidationChain, this.postSpendCredit);
    this.router.post(`${this.path}/stopgap`, PurchaseStoreCreditValidationChain, this.postPurchaseCredit);
    this.router.post(`${this.path}/discount`, CheckJWT, ScopeEditCredit, IssueStoreCreditValidationChain, this.postIssueCredit);
  };

  private getValidateCredit = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const credit_code = req.query.code as string;
      const validate_response = await StoreCreditProviderInstance.ValidateAndLockCode(credit_code);
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
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Request: ${JSON.stringify(req.query)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  }

  private postSpendCredit = async (req: Request, res: Response, next: NextFunction) => {
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
  }

  private postPurchaseCredit = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        GoogleProviderInstance.SendEmail(
          EMAIL_ADDRESS,
          { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
          "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
          "dave@windycitypie.com",
          `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(errors.array())}</p>`);
        return res.status(422).json({ errors: errors.array() });
      }
      const reference_id = Date.now().toString(36).toUpperCase();
      const amount_money = BigInt(Math.round(req.body.credit_amount * 100));
      const sender_name = req.body.sender_name.replace("&", "and").replace("<", "").replace(">", "");
      const sender_email_address = req.body.sender_email_address;
      const recipient_name_first = req.body.recipient_name_first.replace("&", "and").replace("<", "").replace(">", "");;
      const recipient_name_last = req.body.recipient_name_last.replace("&", "and").replace("<", "").replace(">", "");;
      const recipient_email_address = req.body.recipient_email_address;
      const recipient_message = req.body.recipient_message.replace("&", "and").replace("<", "").replace(">", "");;
      const joint_credit_code = StoreCreditProviderInstance.GenerateCreditCode();
      const qr_code_fs = await StoreCreditProviderInstance.GenerateQRCodeFS(joint_credit_code);
      const qr_code_fs_a = new Stream.PassThrough();
      const qr_code_fs_b = new Stream.PassThrough();
      qr_code_fs.pipe(qr_code_fs_a);
      qr_code_fs.pipe(qr_code_fs_b);
      const create_order_response = await SquareProviderInstance.CreateOrderStoreCredit(reference_id, amount_money, `Purchase of store credit code: ${joint_credit_code}`);
      if (create_order_response.success === true) {
        const square_order_id = create_order_response.result.order.id;
        logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${amount_money}`)
        const payment_response = await SquareProviderInstance.ProcessPayment(req.body.nonce, amount_money, reference_id, square_order_id);
        if (payment_response.success === true) {
          const amount = Number(Number(payment_response.result.payment.totalMoney.amount) / 100).toFixed(2);
          CreateExternalEmailSender(EMAIL_ADDRESS, STORE_NAME, amount, sender_email_address, recipient_name_first, recipient_name_last, joint_credit_code, qr_code_fs_a);
          if (req.body.send_email_to_recipient) {
            CreateExternalEmailRecipient(EMAIL_ADDRESS, STORE_NAME, amount, sender_name, recipient_name_first, recipient_name_last, recipient_email_address, recipient_message, joint_credit_code, qr_code_fs_b);
          }
          
          await StoreCreditProviderInstance.CreateCreditFromCreditCode(`${recipient_name_first} ${recipient_name_last}`, amount, "MONEY", joint_credit_code, "", "WARIO", "");
          logger.info(`Store credit code: ${joint_credit_code} and Square Order ID: ${square_order_id} payment for ${amount_money} successful, credit logged to spreadsheet.`)
          return res.status(200).json({reference_id, 
            joint_credit_code, 
            square_order_id, 
            amount_money: Number(payment_response.result.payment.totalMoney.amount), 
            last4: payment_response.result.payment.cardDetails.card.last4, 
            receipt_url: payment_response.result.payment.receiptUrl
          });
        }
        else {
          logger.error("Failed to process payment: %o", payment_response);
          await SquareProviderInstance.OrderStateChange(square_order_id, create_order_response.result.order.version + 1, "CANCELED");
          return res.status(400).json(payment_response);
        }
      } else {
        logger.error(JSON.stringify(create_order_response));
        return res.status(500).json({ success: false });
      }
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  }
  private postIssueCredit = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const amountAsString = Number(req.body.amount).toFixed(2);
      const expiration = req.body.expiration ? parse(req.body.expiration, WDateUtils.DATE_STRING_INTERNAL_FORMAT, Date.now()) : null
      const added_by = req.body.added_by;
      const recipient_name_first = req.body.recipient_name_first;
      const recipient_name_last = req.body.recipient_name_last;
      const recipient_email = req.body.recipient_email;
      const reason = req.body.reason;
      const credit_code = StoreCreditProviderInstance.GenerateCreditCode();
      const qr_code_fs = await StoreCreditProviderInstance.GenerateQRCodeFS(credit_code);
      const expiration_formatted = expiration ? format(expiration, WDateUtils.DATE_STRING_INTERNAL_FORMAT) : "";
      await StoreCreditProviderInstance.CreateCreditFromCreditCode(`${recipient_name_first} ${recipient_name_last}`, amountAsString, "DISCOUNT", credit_code, expiration_formatted, added_by, reason);
      await CreateExternalEmail(EMAIL_ADDRESS, STORE_NAME, amountAsString, recipient_name_first, recipient_name_last, recipient_email, credit_code, expiration, qr_code_fs);
      logger.info(`Store credit code: ${credit_code} of type DISCOUNT for ${amountAsString} added by ${added_by} for reason: ${reason}.`)
      return res.status(200).json({ credit_code: credit_code });
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN GIFT CARD PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  }
}