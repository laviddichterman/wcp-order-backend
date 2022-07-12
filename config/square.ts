import {  ApiError, Client, CreateOrderRequest, CreatePaymentRequest, Environment, UpdateOrderRequest } from 'square';

import crypto from 'crypto';
import logger from'../logging';
import { DataProvider } from './dataprovider';

export class SquareProvider {
  #client : Client;
  #location_id : string;
  constructor() {
  }

  BootstrapProvider = (db : DataProvider) => {
    const cfg = db.KeyValueConfig;
    if (cfg.SQUARE_TOKEN && cfg.SQUARE_LOCATION) {
      this.#client = new Client({
        environment: Environment.Production, // `Environment.Sandbox` to access sandbox resources // TODO: configure this
        accessToken: cfg.SQUARE_TOKEN,
      });
      this.#location_id = cfg.SQUARE_LOCATION;
    }
    else {
      logger.warn("Can't Bootstrap SQUARE Provider");
    }
  }

  CreateOrderStoreCredit = async (reference_id : string, amount_money : bigint, note : string) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body : CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        referenceId: reference_id,
        lineItems: [{
          quantity: "1",
          catalogObjectId: "DNP5YT6QDIWTB53H46F3ECIN",
          basePriceMoney: {
            "amount": amount_money,
            "currency": "USD"
          },
          note: note
        }],
        locationId: this.#location_id,
        state: "OPEN",
      }
    };
    try {
      logger.info(`sending order request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.createOrder(request_body);
      return { success: true, response: result };
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        response: error
      };
    }
  }

  OrderStateChange = async (square_order_id : string, order_version : number, new_state : string) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body : UpdateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        locationId: this.#location_id,
        version: order_version,
        state: new_state,
      }
    };
    try {
      logger.info(`sending order status change request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.updateOrder(square_order_id, request_body);
      return { success: true, response: result };
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        response: error
      };
    }
  }

  ProcessPayment = async (nonce : string, amount_money : bigint, reference_id : string, square_order_id : string) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = this.#client.paymentsApi;
    const request_body : CreatePaymentRequest = {
      sourceId: nonce,
      amountMoney: {
        amount: amount_money,
        currency: 'USD'
      },
      referenceId: reference_id,
      orderId: square_order_id,
      locationId: this.#location_id,
      autocomplete: true,
      acceptPartialAuthorization: false,
      statementDescriptionIdentifier: "WCP/BTP Online Order",
      //verification_token: request_params.verification_token, //TODO: VERIFICATION TOKEN FOR SCA
      idempotencyKey: idempotency_key
    };
    try {
      logger.info(`sending payment request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await payments_api.createPayment(request_body);
      return { success: true, result: result };
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        result: error.result
      };
    }
  }
};

const SquareProviderInstance = new SquareProvider();
export default SquareProviderInstance;
module.exports = SquareProviderInstance;