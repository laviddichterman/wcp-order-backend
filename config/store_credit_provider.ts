import voucher_codes from 'voucher-code-generator';
import { format, parse, startOfDay, isValid, isBefore } from 'date-fns';
import qrcode from 'qrcode';
import Stream from 'stream';
import { WDateUtils } from "@wcp/wcpshared";
import { GoogleProvider } from "./google";
import aes256gcm from './crypto-aes-256-gcm';

import logger from '../logging';
import { DataProvider } from './dataprovider';

const ACTIVE_SHEET = "CurrentWARIO"
const ACTIVE_RANGE = `${ACTIVE_SHEET}!A2:M`;
export class StoreCreditProvider {
  #db : DataProvider;
  #google: GoogleProvider;
  constructor() {  
  }

BootstrapProvider = async (db : DataProvider, google : GoogleProvider) => {
    this.#db = db;
    this.#google = google;
  }

  /**
   * Generates a credit code in the proper form but does not commit it to the datastore.
   * @returns A credit code in the form [A-Za-z0-9]{3}-[A-Za-z0-9]{2}-[A-Za-z0-9]{3}-[A-Z0-9]{8}
   */
  GenerateCreditCode = () => {
    const reference_id = Date.now().toString(36).toUpperCase();
    const credit_code = voucher_codes.generate({pattern: "###-##-###"})[0];
    const joint_credit_code = `${credit_code}-${reference_id}`;
    return joint_credit_code;
  }

  /**
   * Generates an image file stream for the passed QR code
   * @param {String} code 
   * @returns {Stream.PassThrough} file stream for the generated QR code
   */
  GenerateQRCodeFS = async (code : string) => {
    const qr_code_fs = new Stream.PassThrough();
    await qrcode.toFileStream(qr_code_fs, code, {
      errorCorrectionLevel: "H",
      type: "png",
      width: 300,
      margin: 1,
      color: {
        dark: "#000000ff",//"#B3DDF2FF", uncomment for Chicago flag blue
        light: "#0000"        
      }

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
  CreateCreditFromCreditCode = async (
    recipient: string, 
    amount : string, 
    credit_type : 'MONEY' | 'DISCOUNT', 
    credit_code : string, 
    expiration : string, 
    generated_by : string, 
    reason : string
    ) => {
    const date_added = format(new Date(), WDateUtils.DATE_STRING_INTERNAL_FORMAT);
    const fields = [recipient, amount, credit_type, amount, date_added, generated_by, date_added, credit_code, expiration, reason, "", "", ""];
    return this.#google.AppendToSheet(this.#db.KeyValueConfig.STORE_CREDIT_SHEET, `${ACTIVE_SHEET}!A1:M1`, fields);
  }

  /**
   * Finds the code and sets a new lock on the code. 
   * To change the value in future steps, the lock value must be provided.
   * @param {String} credit_code 
   * @returns {{lock: {enc, iv, auth}, valid: Boolean, balance: Number, type: String}}
   */
  ValidateAndLockCode = async (credit_code : string) => { 
    const beginningOfToday = startOfDay(new Date());
    const values_promise = this.#google.GetValuesFromSheet(this.#db.KeyValueConfig.STORE_CREDIT_SHEET, ACTIVE_RANGE);
    // TODO: remove dashes from credit code
    const [enc, iv, auth] = aes256gcm.encrypt(credit_code);
    const values = await values_promise;
    const i = values.values.findIndex((x : string[]) => x[7] === credit_code);
    if (i === -1) { 
      return {valid: false, type: "MONEY", lock: {}, balance: 0};
    }
    const entry = values.values[i];
    const date_modified = format(new Date(), WDateUtils.DATE_STRING_INTERNAL_FORMAT);
    const new_entry = [entry[0], entry[1], entry[2], entry[3], entry[4], entry[5], date_modified, entry[7], entry[8], entry[9], enc, iv.toString('hex'), auth.toString('hex')];
    const new_range = `${ACTIVE_SHEET}!${2 + i}:${2 + i}`;
    const update_promise = this.#google.UpdateValuesInSheet(this.#db.KeyValueConfig.STORE_CREDIT_SHEET, new_range, new_entry);
    const expiration = entry[8] ? startOfDay(parse(entry[8], WDateUtils.DATE_STRING_INTERNAL_FORMAT, new Date())) : null;
    await update_promise;
    return { valid: expiration === null || !isValid(expiration) || !isBefore(expiration, beginningOfToday),
      type: entry[2],
      lock: {enc, iv, auth},
      balance: parseFloat(Number(entry[3]).toFixed(2)) };
  }

  ValidateLockAndSpend = async (credit_code : string, lock : { enc: string, iv: string, auth: string }, amount : number, updated_by : string) => {
    const beginningOfToday = startOfDay(new Date());
    const values = await this.#google.GetValuesFromSheet(this.#db.KeyValueConfig.STORE_CREDIT_SHEET, ACTIVE_RANGE);
    for (let i = 0; i < values.values.length; ++i) {
      const entry = values.values[i];
      if (entry[7] == credit_code) {
        const credit_balance = parseFloat(Number(entry[3]).toFixed(2));
        if (amount > credit_balance) {
          logger.error(`We have a cheater folks, store credit key ${entry[7]}, attempted to use ${amount} but had balance ${credit_balance}`);
          return { success:false, entry: [], index: 0 };
        }
        if (entry[10] != lock.enc ||
          entry[11] != lock.iv || 
          entry[12] != lock.auth) {
          logger.error(`WE HAVE A CHEATER FOLKS, store credit key ${entry[7]}, expecting encoded: ${JSON.stringify(lock)}.`);
          return { success:false, entry: [], index: 0 };
        }
        if (entry[8]) {
          const expiration = startOfDay(parse(entry[8], WDateUtils.DATE_STRING_INTERNAL_FORMAT, beginningOfToday));
          if (isBefore(expiration, beginningOfToday)) {
            logger.error(`We have a cheater folks, store credit key ${entry[7]}, attempted to use after expiration of ${entry[8]}.`);
            return { success:false, entry: [], index: 0 };
          }
        }
        // no shenanagains confirmed
        const date_modified = format(beginningOfToday, WDateUtils.DATE_STRING_INTERNAL_FORMAT);
        const new_balance = credit_balance - amount;
        const new_entry = [entry[0], entry[1], entry[2], new_balance, entry[4], updated_by, date_modified, entry[7], entry[8], entry[9], entry[10], entry[11], entry[12]];
        const new_range = `${ACTIVE_SHEET}!${2 + i}:${2 + i}`;
        // TODO switch to volatile-esq update API call
        await this.#google.UpdateValuesInSheet(this.#db.KeyValueConfig.STORE_CREDIT_SHEET, new_range, new_entry);
        logger.info(`Debited ${amount} from code ${credit_code} yielding balance of ${new_balance}.`);
        return { success: true, entry: entry, index: i };
      }
    }
    logger.error(`Not sure how, but the store credit key wasn't found: ${credit_code}`);
    return { success: false, entry: [], index: 0 };
  }

  CheckAndRefundStoreCredit = async (old_entry : any[], index : number) => {
    // TODO: we're re-validating the encryption key to ensure there's not a race condition or a bug
    // TODO: throw an exception or figure out how to communicate this error
    const new_range = `${ACTIVE_SHEET}!${2 + index}:${2 + index}`;
    // TODO switch to volatile-esq update API call
    await this.#google.UpdateValuesInSheet(this.#db.KeyValueConfig.STORE_CREDIT_SHEET, new_range, old_entry);
    return true;
  }

};

const StoreCreditProviderInstance = new StoreCreditProvider();
export default StoreCreditProviderInstance;
module.exports = StoreCreditProvider;