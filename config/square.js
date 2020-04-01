const SquareConnect = require('square-connect');
const crypto = require('crypto');

const accessToken = process.env.SQUARE_TOKEN;

// Set Square Connect credentials and environment
const defaultClient = SquareConnect.ApiClient.instance;

// Configure OAuth2 access token for authorization: oauth2
const oauth2 = defaultClient.authentications['oauth2'];
oauth2.accessToken = accessToken;

// Set 'basePath' to switch between sandbox env and production env
const SQUARE_ENDPOINT_SANDBOX = 'https://connect.squareupsandbox.com';
const SQUARE_ENDPOINT_PRODUCTION = 'https://connect.squareup.com';
defaultClient.basePath = SQUARE_ENDPOINT_PRODUCTION;

class SquareProvider {

  ProcessPayment = async (request_params) => {      
    // length of idempotency_key should be less than 45
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orderID = Date.now().toString(36).toUpperCase();
    const payments_api = new SquareConnect.PaymentsApi();
    const request_body = {
      source_id: request_params.nonce,
      amount_money: {
        amount: Math.round(request_params.amount_money * 100),
        currency: 'USD'
      },
      tip_money: {
        amount: Math.round(request_params.tip_money * 100),
        currency: 'USD'
      },
      reference_id: orderID,
      autocomplete: true,
      statement_description: "WCP/BTP Online Order",
      //verification_token: request_params.verification_token, //TODO: VERIFICATION TOKEN FOR SCA
      idempotency_key: idempotency_key
    };
    try {
      const response = await payments_api.createPayment(request_body);
      return [{
        title: 'Payment Successful',
        order_id: orderID,
        result: response
        }, 200];
    } catch(error) {
      console.log(error);
      logger.error(error);
      return [{
        'title': 'Payment Failure',
        order_id: orderID,
        'result': error.response.text
      }, 500];
    }
  }
};

const SQUARE_PROVIDER = new SquareProvider();

module.exports = SQUARE_PROVIDER;