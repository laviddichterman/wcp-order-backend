const SquareConnect = require('square-connect');
const crypto = require('crypto');
const logger = require('../logging');

class SquareProvider {
  #defaultClient;
  #location_id;
  constructor() {
    this.#defaultClient = SquareConnect.ApiClient.instance;
  }

  BootstrapProvider = (db) => {
    const cfg = db.KeyValueConfig;
    if (cfg.SQUARE_ENDPOINT && cfg.SQUARE_TOKEN && cfg.SQUARE_LOCATION) {
      this.#defaultClient.basePath = cfg.SQUARE_ENDPOINT;
      this.#defaultClient.authentications['oauth2'].accessToken = cfg.SQUARE_TOKEN;
      this.#location_id = cfg.SQUARE_LOCATION;
    }
    else {
      logger.warn("Can't Bootstrap SQUARE Provider");
    }
  }

  CreateOrderStoreCredit = async (reference_id, amount_money) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = new SquareConnect.OrdersApi();
    const request_body = {
      idempotency_key: idempotency_key,
      order: {
        reference_id: reference_id,
        line_items: [{
          quantity: "1",
          catalog_object_id: "DNP5YT6QDIWTB53H46F3ECIN",
          base_price_money: {
            "amount": amount_money,
            "currency": "USD"
          }
        }],
        location_id: this.#location_id,
        state: "OPEN",
      }
    };
    try {
      logger.info(`sending order request: ${JSON.stringify(request_body)}`);
      const response = await orders_api.createOrder(this.#location_id, request_body);
      return { success: true, response: response };
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        response: error
      };
    }
  }

  OrderStateChange = async (square_order_id, order_version, new_state) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = new SquareConnect.OrdersApi();
    const request_body = {
      idempotency_key: idempotency_key,
      order: {
        location_id: this.#location_id,
        version: order_version,
        state: new_state,
      }
    };
    try {
      logger.info(`sending order status change request: ${JSON.stringify(request_body)}`);
      const response = await orders_api.updateOrder(this.#location_id, square_order_id, request_body);
      return { success: true, response: response };
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        response: error
      };
    }
  }

  ProcessPayment = async (nonce, amount_money, reference_id, square_order_id) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = new SquareConnect.PaymentsApi();
    const request_body = {
      source_id: nonce,
      amount_money: {
        amount: amount_money,
        currency: 'USD'
      },
      reference_id: reference_id,
      order_id: square_order_id,
      location_id: this.#location_id,
      autocomplete: true,
      accept_partial_authorization: false,
      statement_description: "WCP/BTP Online Order",
      //verification_token: request_params.verification_token, //TODO: VERIFICATION TOKEN FOR SCA
      idempotency_key: idempotency_key
    };
    try {
      logger.info(`sending payment request: ${JSON.stringify(request_body)}`);
      const response = await payments_api.createPayment(request_body);
      return { success: true, result: response };
    } catch (error) {
      logger.error(error);
      return {
        success: false,
        result: error.response.text
      };
    }
  }
};

const SQUARE_PROVIDER = new SquareProvider();

module.exports = SQUARE_PROVIDER;