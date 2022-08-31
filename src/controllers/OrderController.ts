import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { CreateOrderRequestV2, CreateOrderResponse, CURRENCY } from '@wcp/wcpshared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import { DataProviderInstance } from '../config/dataprovider';
import { OrderManagerInstance } from '../config/order_manager';
import IExpressController from '../types/IExpressController';
import { GoogleProviderInstance } from '../config/google';
import { isFulfillmentDefined } from '../types/Validations';

const V2OrderValidationChain = [
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

export class OrderController implements IExpressController {
  public path = "/api/v1/order";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, expressValidationMiddleware(V2OrderValidationChain), this.postOrder);
    //this.router.get(`${this.path}`, expressValidationMiddleware(V2OrderValidationChain), this.getOrder);
  };

  private postOrder = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
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
