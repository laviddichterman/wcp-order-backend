import { Router, Request, Response, NextFunction } from 'express';
import { CreateOrderRequestV2, CURRENCY, DiscountMethod, FulfillmentTime, PaymentMethod, TenderBaseStatus, WFulfillmentStatus, WOrderInstance, WOrderStatus } from '@wcp/wario-shared';
import validationMiddleware from '../middleware/validationMiddleware';
import { DataProviderInstance } from '../config/dataprovider';
import { OrderManagerInstance } from '../config/order_manager';
import IExpressController from '../types/IExpressController';
import { GoogleProviderInstance } from '../config/google';
import { CheckJWT, ScopeReadOrders, ScopeWriteOrders, ScopeCancelOrders } from '../config/authorization';
import { 
  OrderIdParams, 
  QueryOrdersDto, 
  CreateOrderDto, 
  CancelOrderDto, 
  ConfirmOrderDto, 
  MoveOrderDto, 
  RescheduleOrderDto 
} from '../dto/order/OrderDtos';
import HttpException from '../types/HttpException';

// Middleware to check for idempotency-key header
const checkIdempotencyKey = (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers['idempotency-key']) {
    return next(new HttpException(400, 'idempotency-key header is required'));
  }
  next();
};

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
    this.router.post(`${this.path}`, validationMiddleware(CreateOrderDto), this.postOrder);
    this.router.get(`${this.path}/:oId`, CheckJWT, ScopeReadOrders, validationMiddleware(OrderIdParams, { source: 'params' }), this.getOrder);
    this.router.get(`${this.path}`, CheckJWT, ScopeReadOrders, validationMiddleware(QueryOrdersDto, { source: 'query' }), this.getOrders);
    this.router.put(`${this.path}/unlock`, CheckJWT, ScopeWriteOrders, this.putUnlock);
    this.router.put(`${this.path}/:oId/cancel`, CheckJWT, ScopeCancelOrders, checkIdempotencyKey, validationMiddleware(OrderIdParams, { source: 'params' }), validationMiddleware(CancelOrderDto), this.putCancelOrder);
    this.router.put(`${this.path}/:oId/send`, CheckJWT, ScopeWriteOrders, checkIdempotencyKey, validationMiddleware(OrderIdParams, { source: 'params' }), this.putSendOrder);
    this.router.put(`${this.path}/:oId/confirm`, CheckJWT, ScopeWriteOrders, checkIdempotencyKey, validationMiddleware(OrderIdParams, { source: 'params' }), validationMiddleware(ConfirmOrderDto), this.putConfirmOrder);
    this.router.put(`${this.path}/:oId/move`, CheckJWT, ScopeWriteOrders, checkIdempotencyKey, validationMiddleware(OrderIdParams, { source: 'params' }), validationMiddleware(MoveOrderDto), this.putMoveOrder);
    this.router.put(`${this.path}/:oId/reschedule`, CheckJWT, ScopeWriteOrders, checkIdempotencyKey, validationMiddleware(OrderIdParams, { source: 'params' }), validationMiddleware(RescheduleOrderDto), this.putRescheduleOrder);
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
      const refundToOriginalPayment = req.body.refundToOriginalPayment as boolean || false;
      const orderId = req.params.oId;
      const reason = req.body.reason as string;
      const emailCustomer = req.body.emailCustomer as boolean;
      const response = await OrderManagerInstance.CancelOrder(idempotencyKey, orderId, reason, emailCustomer, refundToOriginalPayment);
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
