import { Router, Request, Response, NextFunction } from 'express';
import { body, param, header, query } from 'express-validator';
import { CreateOrderRequestV2, CURRENCY, DiscountMethod, FulfillmentTime, PaymentMethod, TenderBaseStatus, WFulfillmentStatus, WOrderInstance, WOrderStatus } from '@wcp/wcpshared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import { DataProviderInstance } from '../config/dataprovider';
import { OrderManagerInstance } from '../config/order_manager';
import IExpressController from '../types/IExpressController';
import { GoogleProviderInstance } from '../config/google';
import { CheckJWT, ScopeReadOrders, ScopeWriteOrders, ScopeCancelOrders } from '../config/authorization';
import { isFulfillmentDefined } from '../types/Validations';

const OrderIdValidationChain = [
  param('oId').trim().escape().exists().isMongoId(),
]

const CreateOrderValidationChain = [
  body('fulfillment.status').exists().equals(WFulfillmentStatus.PROPOSED),
  body('fulfillment.selectedService').exists().isMongoId().custom(isFulfillmentDefined),
  body('fulfillment.selectedDate').isISO8601(),
  body('fulfillment.selectedTime').isInt({ min: 0, max: 1440 }).exists(),
  body('customerInfo.givenName').trim().exists().isLength({ min: 1 }),
  body('customerInfo.familyName').trim().exists().isLength({ min: 1 }),
  body('customerInfo.mobileNum').trim().escape().exists(),
  body('customerInfo.email').isEmail().exists(),
  body('customerInfo.referral').trim().escape(),
  body('proposedDiscounts').isArray(),
  body('proposedDiscounts.*.t').exists().equals(DiscountMethod.CreditCodeAmount),
  body('proposedDiscounts.*.status').exists().equals(TenderBaseStatus.AUTHORIZED),
  body('proposedDiscounts.*.discount.amount.amount').exists().isInt({ min: 0 }),
  body('proposedDiscounts.*.discount.amount.currency').exists().isIn(Object.values(CURRENCY)),
  body('proposedDiscounts.*.discount.balance.amount').isInt({ min: 0 }).exists(),
  body('proposedDiscounts.*.discount.balance.currency').exists().isIn(Object.values(CURRENCY)),
  body('proposedDiscounts.*.discount.code').exists().isString().isLength({ min: 19, max: 19 }),
  body('proposedDiscounts.*.discount.lock.enc').exists().isString(),
  body('proposedDiscounts.*.discount.lock.iv').exists().isString(),
  body('proposedDiscounts.*.discount.lock.auth').exists().isString(),
  body('proposedPayments').isArray(),
  body('proposedPayments.*.t').exists().isIn([PaymentMethod.CreditCard, PaymentMethod.StoreCredit]),
  body('proposedPayments.*.status').exists().equals(TenderBaseStatus.PROPOSED),
  body('cart.*.categoryId').exists().isMongoId(),
  body('cart.*.quantity').exists().isInt({ min: 1 }),
  body('cart.*.product').exists(),
  body('tip.isSuggestion').exists().toBoolean(true),
  body('tip.isPercentage').exists().toBoolean(true),
  body('specialInstructions').optional({ nullable: true }).trim()
];

const IdempotentOrderIdPutValidationChain = [
  header('idempotency-key').exists(),
  ...OrderIdValidationChain
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

const MoveOrderValidationChain = [
  ...IdempotentOrderIdPutValidationChain,
  body('destination').trim().exists(),
  body('additionalMessage').trim().exists(),
]

const RescheduleOrderValidationChain = [
  ...IdempotentOrderIdPutValidationChain,
  body('selectedDate').isISO8601(),
  body('selectedTime').isInt({ min: 0, max: 1440 }).exists(),
  body('emailCustomer').exists().toBoolean(true),
  body('additionalMessage').trim().exists(),
]

const AdjustOrderValidationChain = [
  ...IdempotentOrderIdPutValidationChain,
  // HASN'T EVEN BEEN LOOKED AT EVEN A LITTLE BIT. DO NOT SUBMIT THIS CODE UNTIL IT'S VALIDATED OR THE PATCH METHOD IS COMMENTED OUT
]

const QueryOrdersValidationChain = [
  query('date').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  query('status').optional({ nullable: true, checkFalsy: true }).isIn(Object.values(WOrderStatus)),
]

const SendFailureNoticeOnErrorCatch = (req: Request, error: any) => {
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  GoogleProviderInstance.SendEmail(
    EMAIL_ADDRESS,
    { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
    "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
    "dave@windycitypie.com",
    `<p>Request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
}

export class OrderController implements IExpressController {
  public path = "/api/v1/order";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, expressValidationMiddleware(CreateOrderValidationChain), this.postOrder);
    this.router.get(`${this.path}/:oId`, CheckJWT, ScopeReadOrders, expressValidationMiddleware(OrderIdValidationChain), this.getOrder);
    this.router.get(`${this.path}`, CheckJWT, ScopeReadOrders, expressValidationMiddleware(QueryOrdersValidationChain), this.getOrders);
    this.router.put(`${this.path}/unlock`, CheckJWT, ScopeWriteOrders, this.putUnlock);
    this.router.put(`${this.path}/:oId/cancel`, CheckJWT, ScopeCancelOrders, expressValidationMiddleware(CancelOrderValidationChain), this.putCancelOrder);
    this.router.put(`${this.path}/:oId/send`, CheckJWT, ScopeWriteOrders, expressValidationMiddleware(IdempotentOrderIdPutValidationChain), this.putSendOrder);
    this.router.put(`${this.path}/:oId/confirm`, CheckJWT, ScopeWriteOrders, expressValidationMiddleware(ConfirmOrderValidationChain), this.putConfirmOrder);
    this.router.put(`${this.path}/:oId/move`, CheckJWT, ScopeWriteOrders, expressValidationMiddleware(MoveOrderValidationChain), this.putMoveOrder);
    this.router.put(`${this.path}/:oId/reschedule`, CheckJWT, ScopeWriteOrders, expressValidationMiddleware(RescheduleOrderValidationChain), this.putRescheduleOrder);
    // this.router.patch(`${this.path}/:oId`, CheckJWT, ScopeWriteOrders, expressValidationMiddleware(AdjustOrderValidationChain), this.patchAdjustOrder);
  };

  private postOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reqBody: CreateOrderRequestV2 = {
        cart: req.body.cart,
        proposedDiscounts: req.body.proposedDiscounts,
        proposedPayments: req.body.proposedPayments,
        customerInfo: req.body.customerInfo,
        fulfillment: req.body.fulfillment,
        metrics: req.body.metrics,
        specialInstructions: req.body.specialInstructions,
        tip: req.body.tip
      };
      const ipAddress = (req.headers['x-real-ip'] as string) ?? (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? "";
      const response = await OrderManagerInstance.CreateOrder(reqBody, ipAddress);
      res.status(response.status).json(response);
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private putCancelOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key')!;
      const orderId = req.params.oId;
      const reason = req.body.reason as string;
      const emailCustomer = req.body.emailCustomer as boolean;
      const response = await OrderManagerInstance.CancelOrder(idempotencyKey, orderId, reason, emailCustomer);
      res.status(response.status).json(response);
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private putConfirmOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key')!;
      const orderId = req.params.oId;
      const additionalMessage = req.body.additionalMessage as string;
      const response = await OrderManagerInstance.ConfirmOrder(idempotencyKey, orderId, additionalMessage);
      res.status(response.status).json(response);
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private putMoveOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key')!;
      const orderId = req.params.oId;
      const destination = req.body.destination as string;
      const additionalMessage = req.body.additionalMessage as string;
      const response = await OrderManagerInstance.SendMoveOrderTicket(idempotencyKey, orderId, destination, additionalMessage);
      res.status(response.status).json(response);
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private putRescheduleOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key')!;
      const orderId = req.params.oId;
      const newTime: FulfillmentTime = { selectedDate: req.body.selectedDate, selectedTime: req.body.selectedTime };
      const emailCustomer = req.body.emailCustomer as boolean;
      const response = await OrderManagerInstance.AdjustOrderTime(idempotencyKey, orderId, newTime, emailCustomer, req.body.additionalMessage);
      res.status(response.status).json(response);
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private patchAdjustOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.get('idempotency-key')!;
      const orderId = req.params.oId;
      const orderUpdate = req.body.order as Partial<Pick<WOrderInstance, 'customerInfo' | 'cart' | 'discounts' | 'fulfillment' | 'specialInstructions' | 'tip'>>;
      const response = await OrderManagerInstance.AdjustOrder(idempotencyKey, orderId, orderUpdate);
      res.status(response.status).json(response);
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private putUnlock = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const response = await OrderManagerInstance.ObliterateLocks();
      res.status(200).json({ ok: "yay!" });
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private putSendOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.oId;
      const idempotencyKey = req.get('idempotency-key')!;

      const response = await OrderManagerInstance.SendOrder(idempotencyKey, orderId);
      if (response) {
        res.status(200).json(response);
      } else {
        res.status(404).json(null);
      }
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private getOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.oId;
      const response = await OrderManagerInstance.GetOrder(orderId);
      if (response) {
        res.status(200).json(response);
      } else {
        res.status(404).json(null);
      }
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }

  private getOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queryDate = req.query.date ? req.query.date as string : null;
      const queryStatus = req.query.status ? WOrderStatus[req.query.status as keyof typeof WOrderStatus] ?? null : null;
      const response = await OrderManagerInstance.GetOrders(queryDate ? { $gte: queryDate } : null, queryStatus);
      res.status(200).json(response);
    } catch (error) {
      SendFailureNoticeOnErrorCatch(req, error);
      next(error)
    }
  }
}
