import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { CreateOrderRequestV2, CreateOrderResponse } from '@wcp/wcpshared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import DataProviderInstance from '../config/dataprovider';
import OrderManagerInstance from '../config/order_manager';
import IExpressController from '../types/IExpressController';
import GoogleProviderInstance from '../config/google';
import { BigIntStringify } from '../utils';


const V2OrderValidationChain = [
  body('fulfillmentDto.selectedService').isInt({ min: 0, max: 2 }).exists(),
  body('fulfillmentDto.selectedDate').isISO8601().exists(),
  body('fulfillmentDto.selectedTime').isInt({ min: 0, max: 1440 }).exists(),
  body('customerInfo.givenName').trim().escape().exists(),
  body('customerInfo.familyName').trim().escape().exists(),
  body('customerInfo.mobileNum').trim().escape().exists(),
  body('customerInfo.email').isEmail().exists(),
  body('customerInfo.referral').trim().escape(),
  body('cart.*.categoryId').exists().isMongoId(),
  body('cart.*.quantity').exists().isInt({ min: 1 }),
  body('cart.*.quantity').exists().isInt({ min: 1 }),
  body('cart.*.product').exists(),
  body('special_instructions').trim().escape()
];

export class OrderController implements IExpressController {
  public path = "/api/v1/order";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, expressValidationMiddleware(V2OrderValidationChain), this.postOrder);
  };

  private postOrder = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const reqBody: CreateOrderRequestV2 = req.body;
      const response = await OrderManagerInstance.CreateOrder(reqBody, (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress);
      res.status(response.status).json({ success: response.success, result: response.result } as CreateOrderResponse);
    } catch (error) {
      GoogleProviderInstance.SendEmail(
        EMAIL_ADDRESS,
        { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${BigIntStringify(req.body)}</p><p>Error info:${BigIntStringify(error)}</p>`);
      next(error)
    }
  }
}
