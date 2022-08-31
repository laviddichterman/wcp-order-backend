import voucher_codes from 'voucher-code-generator';
import { startOfDay, isValid, isBefore, parseISO, format } from 'date-fns';
import qrcode from 'qrcode';
import { ValidateLockAndSpendRequest, ValidateLockAndSpendSuccess, ValidateAndLockCreditResponse, WDateUtils, StoreCreditType, IMoney, IssueStoreCreditRequest, CURRENCY, MoneyToDisplayString, PurchaseStoreCreditRequest, PurchaseStoreCreditResponse, PaymentMethod, OrderPayment, CreditPayment } from "@wcp/wcpshared";
import { GoogleProviderInstance } from "./google";
import { SquareProviderInstance } from "./square";
import { DataProviderInstance } from './dataprovider';
import internal, { Stream } from 'stream';
import aes256gcm from './crypto-aes-256-gcm';
import logger from '../logging';


const ACTIVE_SHEET = "CurrentWARIO"
const ACTIVE_RANGE = `${ACTIVE_SHEET}!A2:M`;


const CreateExternalEmailSender = async ({ amount, senderEmail, recipientNameFirst, recipientNameLast }: Pick<PurchaseStoreCreditRequest, 'amount' | 'senderEmail' | 'recipientNameFirst' | 'recipientNameLast'>, creditCode: string, qr_code_fs: internal.PassThrough) => {
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
  return await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    senderEmail,
    `Store credit purchase of value ${amountString} for ${recipient}.`,
    EMAIL_ADDRESS,
    emailbody,
    [{ filename: "qrcode.png", content: qr_code_fs, cid: creditCode }]);
};

const CreateExternalEmailRecipient = async ({ amount, senderName, recipientNameFirst, recipientNameLast, recipientEmail, recipientMessage }: PurchaseStoreCreditRequest, creditCode: string, qr_code_fs: internal.PassThrough) => {
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
  return await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    recipientEmail,
    `${recipientNameFirst}, you've got store credit to Windy City Pie and Breezy Town Pizza!`,
    EMAIL_ADDRESS,
    emailbody,
    [{ filename: "qrcode.png", content: qr_code_fs, cid: creditCode }]);
}

const CreateExternalEmail = async ({ amount, recipientNameFirst, recipientNameLast, recipientEmail, expiration }: IssueStoreCreditRequest, creditCode: string, qr_code_fs: internal.PassThrough) => {
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
    [{ filename: "qrcode.png", content: qr_code_fs, cid: creditCode }]);
};



export class StoreCreditProvider {
  constructor() { }

  /**
   * Generates a credit code in the proper form but does not commit it to the datastore.
   * @returns A credit code in the form [A-Za-z0-9]{3}-[A-Za-z0-9]{2}-[A-Za-z0-9]{3}-[A-Z0-9]{8}
   */
  GenerateCreditCode = () => {
    const reference_id = Date.now().toString(36).toUpperCase();
    const credit_code = voucher_codes.generate({ pattern: "###-##-###" })[0];
    const joint_credit_code = `${credit_code}-${reference_id}`;
    return joint_credit_code;
  }

  /**
   * Generates an image file stream for the passed QR code
   * @param {String} code 
   * @returns {Stream.PassThrough} file stream for the generated QR code
   */
  GenerateQRCodeFS = async (code: string) => {
    const qr_code_fs = new Stream.PassThrough();
    await qrcode.toFileStream(qr_code_fs, code, {
      errorCorrectionLevel: "H",
      type: "png",
      width: 300,
      margin: 1,
      // color: {
      //   dark: "#000000ff",//"#B3DDF2FF", uncomment for Chicago flag blue
      //   light: "#0000"
      // }

    });
    return qr_code_fs;
  }

  /**
   * 
   * @param {String} recipient - name of the person that holds the credit
   * @param {Number} amount - a floating point number corresponding to the credit stored
   * @param {String} credit_type - either DISCOUNT or MONEY
   * @param {String} credit_code 
   * @param {*} expiration 
   * @param {*} generated_by 
   * @param {*} reason 
   * @returns ??
   */
  CreateCreditFromCreditCode = async ({
    recipientNameFirst,
    recipientNameLast,
    amount,
    creditType,
    creditCode,
    expiration,
    addedBy,
    reason
  }: Omit<IssueStoreCreditRequest, 'recipientEmail'> & { creditCode: string; }) => {
    const date_added = WDateUtils.formatISODate(Date.now());
    const amountString = (amount.amount / 100).toFixed(2);
    const recipient = `${recipientNameFirst} ${recipientNameLast}`;
    const fields = [recipient, amountString, creditType, amountString, date_added, addedBy, date_added, creditCode, expiration, reason, "", "", ""];
    return await GoogleProviderInstance.AppendToSheet(DataProviderInstance.KeyValueConfig.STORE_CREDIT_SHEET, `${ACTIVE_SHEET}!A1:M1`, fields);
  }

  /**
   * Finds the code and sets a new lock on the code. 
   * To change the value in future steps, the lock value must be provided.
   * @param {String} credit_code 
   * @returns {Promise<ValidateAndLockCreditResponse>}
   */
  ValidateAndLockCode = async (credit_code: string): Promise<ValidateAndLockCreditResponse> => {
    const values_promise = GoogleProviderInstance.GetValuesFromSheet(DataProviderInstance.KeyValueConfig.STORE_CREDIT_SHEET, ACTIVE_RANGE);
    // TODO: remove dashes from credit code
    const lock = aes256gcm.encrypt(credit_code);
    const ivAsString = lock.iv.toString('hex');
    const authAsString = lock.auth.toString('hex');
    const values = await values_promise;
    const i = values.values.findIndex((x: string[]) => x[7] === credit_code);
    if (i === -1) {
      return { valid: false };
    }
    const entry = values.values[i];
    const date_modified = WDateUtils.formatISODate(Date.now());
    const new_entry = [entry[0], entry[1], entry[2], entry[3], entry[4], entry[5], date_modified, entry[7], entry[8], entry[9], lock.enc, ivAsString, authAsString];
    const new_range = `${ACTIVE_SHEET}!${2 + i}:${2 + i}`;
    const update_promise = GoogleProviderInstance.UpdateValuesInSheet(DataProviderInstance.KeyValueConfig.STORE_CREDIT_SHEET, new_range, new_entry);
    const expiration = entry[8] ? startOfDay(parseISO(entry[8])) : null;
    await update_promise;
    const balance = Math.round(Number(entry[3]) * 100);
    const valid = (expiration === null || !isValid(expiration) || !isBefore(expiration, startOfDay(Date.now()))) && balance > 0;
    return valid ? {
      valid: true,
      credit_type: StoreCreditType[entry[2] as keyof typeof StoreCreditType],
      lock: { enc: lock.enc, iv: ivAsString, auth: authAsString },
      amount: { amount: balance, currency: CURRENCY.USD },
    } : { valid: false };
  }

  ValidateLockAndSpend = async ({ amount, code, lock, updatedBy }: ValidateLockAndSpendRequest):
    Promise<{ success: false } | ValidateLockAndSpendSuccess> => {
    const beginningOfToday = startOfDay(Date.now());
    const values = await GoogleProviderInstance.GetValuesFromSheet(DataProviderInstance.KeyValueConfig.STORE_CREDIT_SHEET, ACTIVE_RANGE);
    for (let i = 0; i < values.values.length; ++i) {
      const entry = values.values[i];
      if (entry[7] == code) {
        const credit_balance = Math.round(Number(entry[3]) * 100);
        if (amount.amount > credit_balance) {
          logger.error(`We have a cheater folks, store credit key ${entry[7]}, attempted to use ${MoneyToDisplayString(amount, true)} but had balance ${credit_balance}`);
          return { success: false };
        }
        if (entry[10] != lock.enc ||
          entry[11] != lock.iv ||
          entry[12] != lock.auth) {
          logger.error(`WE HAVE A CHEATER FOLKS, store credit key ${entry[7]}, expecting encoded: ${JSON.stringify(lock)}.`);
          return { success: false };
        }
        if (entry[8]) {
          const expiration = startOfDay(parseISO(entry[8]));
          if (isBefore(expiration, beginningOfToday)) {
            logger.error(`We have a cheater folks, store credit key ${entry[7]}, attempted to use after expiration of ${entry[8]}.`);
            return { success: false };
          }
        }
        // no shenanagains confirmed
        // do we want to update the lock?
        // if we update the lock, we need to store the old lock to revert it to in the case that we need to roll back the transaction
        // const newLock = aes256gcm.encrypt(lock.auth);
        // const newLockAsString = { enc:   newLock.enc, auth: newLock.auth.toString('hex'), iv: newLock.iv.toString('hex') };
        const date_modified = WDateUtils.formatISODate(beginningOfToday);
        const new_balance = ((credit_balance - amount.amount) / 100).toFixed(2);
        const new_entry = [entry[0], entry[1], entry[2], new_balance, entry[4], updatedBy, date_modified, entry[7], entry[8], entry[9], entry[10], entry[11], entry[12]];
        const new_range = `${ACTIVE_SHEET}!${2 + i}:${2 + i}`;
        // TODO switch to volatile-esq update API call
        await GoogleProviderInstance.UpdateValuesInSheet(DataProviderInstance.KeyValueConfig.STORE_CREDIT_SHEET, new_range, new_entry);
        logger.info(`Debited ${MoneyToDisplayString(amount, true)} from code ${code} yielding balance of ${new_balance}.`);
        return { success: true, entry: entry, index: i };
      }
    }
    logger.error(`Not sure how, but the store credit key wasn't found: ${code}`);
    return { success: false };
  }

  CheckAndRefundStoreCredit = async (old_entry: any[], index: number) => {
    // TODO: we're re-validating the encryption key to ensure there's not a race condition or a bug
    // TODO: throw an exception or figure out how to communicate this error

    const new_range = `${ACTIVE_SHEET}!${2 + index}:${2 + index}`;
    // TODO switch to volatile-esq update API call
    await GoogleProviderInstance.UpdateValuesInSheet(DataProviderInstance.KeyValueConfig.STORE_CREDIT_SHEET, new_range, old_entry);
    return true;
  };

  PurchaseStoreCredit = async (request: PurchaseStoreCreditRequest, nonce: string): Promise<PurchaseStoreCreditResponse & { status: number }> => {
    const referenceId = Date.now().toString(36).toUpperCase();

    const amountString = MoneyToDisplayString(request.amount, true);
    const creditCode = this.GenerateCreditCode();
    const qr_code_fs = await this.GenerateQRCodeFS(creditCode);
    const qr_code_fs_a = new Stream.PassThrough();
    const qr_code_fs_b = new Stream.PassThrough();
    qr_code_fs.pipe(qr_code_fs_a);
    qr_code_fs.pipe(qr_code_fs_b);
    const create_order_response = await SquareProviderInstance.CreateOrderStoreCredit(referenceId, request.amount, `Purchase of store credit code: ${creditCode}`);
    if (create_order_response.success === true) {
      const squareOrderId = create_order_response.result.order.id;
      logger.info(`For internal id ${referenceId} created Square Order ID: ${squareOrderId} for ${amountString}`)
      const payment_response = await SquareProviderInstance.ProcessPayment({ sourceId: nonce, amount: request.amount, referenceId, squareOrderId });
      if (payment_response.success === true && payment_response.result.payment.t === PaymentMethod.CreditCard) {
        const orderPayment = payment_response.result.payment;
        await CreateExternalEmailSender(request, creditCode, qr_code_fs_a);
        if (request.sendEmailToRecipient) {
          await CreateExternalEmailRecipient(request, creditCode, qr_code_fs_b);
        }
        return await this.CreateCreditFromCreditCode({
          ...request,
          addedBy: 'WARIO',
          reason: "website purchase",
          creditType: StoreCreditType.MONEY,
          creditCode,
          expiration: null
        })
        .then(async (_) => {
          logger.info(`Store credit code: ${creditCode} and Square Order ID: ${squareOrderId} payment for ${amountString} successful, credit logged to spreadsheet.`)
          return {
            status: 200, error: [], result: {
              referenceId,
              code: creditCode,
              squareOrderId,
              amount: orderPayment.amount,
              last4: orderPayment.payment.last4,
              receiptUrl: orderPayment.payment.receiptUrl
            }, success: true
          };
        })
        // TODO: figure out why this has a type error
        // .catch(async (err: any) => {
        //   const errorDetail = `Failed to create credit code, got error: ${JSON.stringify(err)}`;
        //   logger.error(errorDetail);
        //   await SquareProviderInstance.RefundPayment(orderPayment, "Failed to create credit code");
        //   return { status: 500, success: false, result: null, error: [] };
        // });
      }
      else {
        logger.error("Failed to process payment: %o", payment_response);
        if (create_order_response.result) {
          await SquareProviderInstance.OrderStateChange(squareOrderId, "CANCELED");
        }
        return { status: 400, success: false, result: null, error: payment_response.error.map(x => ({ category: x.category, code: x.code, detail: x.detail! })) };
      }
    } else {
      const errorDetail = JSON.stringify(create_order_response);
      logger.error(errorDetail);
      return { status: 500, success: false, result: null, error: [{ category: 'INTERNAL_SERVER_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
    }
  };

  IssueCredit = async (request: IssueStoreCreditRequest): Promise<{ credit_code: string; status: number }> => {
    const amountAsString = MoneyToDisplayString(request.amount, true);
    const creditCode = StoreCreditProviderInstance.GenerateCreditCode();
    const qr_code_fs = await StoreCreditProviderInstance.GenerateQRCodeFS(creditCode);
    await StoreCreditProviderInstance.CreateCreditFromCreditCode({ ...request, creditCode });
    await CreateExternalEmail(request, creditCode, qr_code_fs);
    logger.info(`Store credit code: ${creditCode} of type ${request.creditType} for ${amountAsString} added by ${request.addedBy} for reason: ${request.reason}.`)
    return { credit_code: creditCode, status: 200 };
  }

};

export const StoreCreditProviderInstance = new StoreCreditProvider();