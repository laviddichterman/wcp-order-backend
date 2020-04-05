// some thing relating to payments
const Router = require('express').Router
const { validate, Joi } = require('express-validation')
const SquareProvider = require("../../../../config/square");
const { logger } = require('express-winston');

const PaymentValidation = {
  body: Joi.object({
    amount_money: Joi.number().positive().required(),
    nonce: Joi.string().required(),
  }),
}

module.exports = Router({ mergeParams: true })
  .post('/v1/payments/payment', validate(PaymentValidation, {}, {}), async (req, res, next) => {
    try {
      const reference_id = Date.now().toString(36).toUpperCase();
      const amount_money = Math.round(req.body.amount_money * 100) + Math.round(req.body.tip_money * 100);
      const create_order_response = await SquareProvider.CreateOrderStoreCredit(reference_id, amount_money);
      if (create_order_response.success === true) {
        logger.debug(create_order_response);
        const square_order_id = create_order_response.response.order.id;
        logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${amount_money}`)
        const payment_response = await SquareProvider.ProcessPayment(req.body.nonce, amount_money, reference_id, square_order_id);
        if (!payment_response.success) {
          logger.error("Failed to process payment: %o", payment_response);
          const order_cancel_response = await SquareProvider.OrderStateChange(square_order_id, create_order_response.response.order.version, "CANCELED");
          logger.debug(order_cancel_response);
          res.status(400).json(payment_response);
        }
        else {
          logger.debug(payment_response);
          const order_complete_response = await SquareProvider.OrderStateChange(square_order_id, create_order_response.response.order.version, "COMPLETED");
          logger.info(`For internal id ${reference_id} and Square Order ID: ${square_order_id} payment for ${amount_money} successful.`)
          res.status(200).json(payment_response);
        }
      } else {
        logger.error(create_order_response);
        res.status(500).json({success:false});
      }
    } catch (error) {
      next(error)
    }
  })