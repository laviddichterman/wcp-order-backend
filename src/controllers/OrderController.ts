import { Router, Request, Response, NextFunction } from 'express';
import { body, param, header } from 'express-validator';
import { CreateOrderRequestV2, CreateOrderResponse, CURRENCY, FulfillmentTime } from '@wcp/wcpshared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import { DataProviderInstance } from '../config/dataprovider';
import { OrderManagerInstance } from '../config/order_manager';
import IExpressController from '../types/IExpressController';
import { GoogleProviderInstance } from '../config/google';
import { ScopeWriteOrders } from '../config/authorization';
import { isFulfillmentDefined } from '../types/Validations';

const CreateOrderValidationChain = [
  body('fulfillment.selectedService').exists().isMongoId().custom(isFulfillmentDefined),
  body('fulfillment.selectedDate').isISO8601(),
  body('fulfillment.selectedTime').isInt({ min: 0, max: 1440 }).exists(),
  body('customerInfo.givenName').trim().exists(),
  body('customerInfo.familyName').trim().exists(),
  body('customerInfo.mobileNum').trim().escape().exists(),
  body('customerInfo.email').isEmail().exists(),
  body('customerInfo.referral').trim().escape(),
  body('creditValidations').isArray(),
  body('cart.*.categoryId').exists().isMongoId(),
  body('cart.*.quantity').exists().isInt({ min: 1 }),
  body('cart.*.product').exists(),
  body('tip.isSuggestion').exists().toBoolean(true),
  body('tip.isPercentage').exists().toBoolean(true),
  body('balance.amount').isInt({min: 0}).exists(),
  body('balance.currency').exists().isIn(Object.values(CURRENCY)),
  body('specialInstructions').optional({nullable: true}).trim()
];

const IdempotentOrderIdPutValidationChain = [
  header('idempotency-key').exists(),
  param('oId').trim().escape().exists().isMongoId(),
]

const CancelOrderValidationChain = [
  ...IdempotentOrderIdPutValidationChain,
  body('reason').trim().exists(),
  body('emailCustomer').exists().toBoolean(true),
];

const ConfirmOrderValidationChain = [
  ...IdempotentOrderIdPutValidationChain,
  body('additionalMessage').trim().exists(),
]

const RescheduleOrderValidationChain = [
  ...IdempotentOrderIdPutValidationChain,
  body('selectedDate').isISO8601(),
  body('selectedTime').isInt({ min: 0, max: 1440 }).exists(),
  body('emailCustomer').exists().toBoolean(true),
]

export class OrderController implements IExpressController {
  public path = "/api/v1/order";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, expressValidationMiddleware(CreateOrderValidationChain), this.postOrder);
    this.router.put(`${this.path}/:oId/cancel`, ScopeWriteOrders, expressValidationMiddleware(CancelOrderValidationChain), this.putCancelOrder);
    this.router.put(`${this.path}/:oId/confirm`, ScopeWriteOrders, expressValidationMiddleware(ConfirmOrderValidationChain), this.putConfirmOrder);
    this.router.put(`${this.path}/:oId/reschedule`, ScopeWriteOrders, expressValidationMiddleware(RescheduleOrderValidationChain), this.putRescheduleOrder);
    //this.router.get(`${this.path}`, expressValidationMiddleware(V2OrderValidationChain), this.getOrder);
  };

  private postOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reqBody: CreateOrderRequestV2 = {
        cart: req.body.cart,
        creditValidations: req.body.creditValidations,
        customerInfo: req.body.customerInfo,
        fulfillment: req.body.fulfillment,
        metrics: req.body.metrics,
        specialInstructions: req.body.specialInstructions,
        tip: req.body.tip,
        balance: req.body.balance,
        nonce: req.body.nonce
      };
      const response = await OrderManagerInstance.CreateOrder(reqBody, (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress);
      res.status(response.status).json({ success: response.success, errors: response.errors, result: response.result } as CreateOrderResponse);
    } catch (error) {
      const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  }

  private putCancelOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key');
      const orderId = req.params.oId;
      const reason = req.body.reason as string;
      const emailCustomer = req.body.emailCustomer as boolean;
      const response = await OrderManagerInstance.CancelOrder(idempotencyKey, orderId, reason, emailCustomer);
      res.status(response.status).json({ success: response.success, errors: response.errors, result: response.result } as CreateOrderResponse);
    } catch (error) {
      const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  }

  private putConfirmOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key');
      const orderId = req.params.oId;
      const additionalMessage = req.body.additionalMessage as string;
      const response = await OrderManagerInstance.ConfirmOrder(idempotencyKey, orderId, additionalMessage);
      res.status(response.status).json({ success: response.success, errors: response.errors, result: response.result } as CreateOrderResponse);
    } catch (error) {
      const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  }

  private putRescheduleOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key');
      const orderId = req.params.oId;
      const newTime: FulfillmentTime = { selectedDate: req.body.selectedDate, selectedTime: req.body.selectedTime };
      const emailCustomer = req.body.emailCustomer as boolean;
      const response = await OrderManagerInstance.AdjustOrderTime(idempotencyKey, orderId, newTime, emailCustomer);
      res.status(response.status).json({ success: response.success, errors: response.errors, result: response.result } as CreateOrderResponse);
    } catch (error) {
      const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      next(error)
    }
  }
}
