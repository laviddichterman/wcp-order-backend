import voucher_codes from 'voucher-code-generator';
import { startOfDay, isValid, isBefore, parseISO } from 'date-fns';
import qrcode from 'qrcode';
import Stream from 'stream';
import { ValidateLockAndSpendRequest, ValidateLockAndSpendSuccess, ValidateAndLockCreditResponse, WDateUtils, StoreCreditType, IMoney, IssueStoreCreditRequest, CURRENCY, MoneyToDisplayString } from "@wcp/wcpshared";
import GoogleProviderInstance from "./google";
import DataProviderInstance from './dataprovider';
import aes256gcm from './crypto-aes-256-gcm';
import logger from '../logging';

const ACTIVE_SHEET = "CurrentWARIO"
const ACTIVE_RANGE = `${ACTIVE_SHEET}!A2:M`;
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
  } : Omit<IssueStoreCreditRequest, 'recipientEmail'> & { creditCode: string; }) => {
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

  ValidateLockAndSpend = async ({ amount, code, lock, updatedBy } : ValidateLockAndSpendRequest) : 
    Promise<{ success: false } | ValidateLockAndSpendSuccess> => {
    const beginningOfToday = startOfDay(Date.now());
    const values = await GoogleProviderInstance.GetValuesFromSheet(DataProviderInstance.KeyValueConfig.STORE_CREDIT_SHEET, ACTIVE_RANGE);
    for (let i = 0; i < values.values.length; ++i) {
      const entry = values.values[i];
      if (entry[7] == code) {
        const credit_balance = Math.round(Number(entry[3])*100);
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
        // const newLock = aes256gcm.encrypt(lock.auth);
        // const newLockAsString = { enc: newLock.enc, auth: newLock.auth.toString('hex'), iv: newLock.iv.toString('hex') };
        const date_modified = WDateUtils.formatISODate(beginningOfToday);
        const new_balance = credit_balance - amount.amount;
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
  }

};

export const StoreCreditProviderInstance = new StoreCreditProvider();
export default StoreCreditProviderInstance;
