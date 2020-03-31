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
defaultClient.basePath = SQUARE_ENDPOINT_SANDBOX;

class SquareProvider {

  ProcessPayment = async (req, res) => {      
    // length of idempotency_key should be less than 45
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const request_params = req.body;
    const orderID = Date.now().toString(36).toUpperCase();
    console.log(epoch_hex);
    const payments_api = new SquareConnect.PaymentsApi();
    const request_body = {
      source_id: request_params.nonce,
      amount_money: {
        amount: Math.round(req.amount_money * 100),
        currency: 'USD'
      },
      tip_money: {
        amount: Math.round(req.tip_money * 100),
        currency: 'USD'
      },
      reference_id: orderID,
      autocomplete: true,
      statement_description: "WCP/BTP Online Order",
      //verification_token: request_params.verification_token, //TODO: VERIFICATION TOKEN FOR SCA
      idempotency_key: idempotency_key
    };
    try {
      // const response = await payments_api.createPayment(request_body);
      // res.status(200).json({
      //   title: 'Payment Successful',
      //   order_id: orderID,
      //   result: response
      // });
      res.status(200).json(request_body);
    } catch(error) {
      res.status(500).json({
        'title': 'Payment Failure',
        order_id: orderID,
        'result': error.response.text
      });
    }
  }
};

const SQUARE_PROVIDER = new SquareProvider();

module.exports = SQUARE_PROVIDER;