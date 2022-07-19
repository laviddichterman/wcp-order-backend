import { Router, Request, Response, NextFunction } from 'express';
import turf, { invariant } from '@turf/turf';

import DataProviderInstance from '../config/dataprovider';
import OrderManagerInstance from '../config/order_manager';
import SocketIoProviderInstance from '../config/socketio_provider';
import logger from '../logging';
import IExpressController from '../types/IExpressController';
import { body, validationResult } from 'express-validator';
import GoogleProviderInstance from '../config/google';

const V1OrderValidationChain = [
  body('service_option').isInt({ min: 0, max: 2 }).exists(),
  body('customer_name').trim().escape().exists(),
  body('service_date').trim().escape().exists(),
  body('service_time').isInt({ min: 0, max: 1440 }).exists(),
  body('phonenum').trim().escape().exists(),
  body('user_email').isEmail().exists(),
  body('referral').escape().optional(),
  //body('delivery_info').deliveryInfoValidator(),
  body('load_time').escape().optional(),
  body('time_selection_time').escape(),
  body('submittime').escape(),
  body('useragent').escape(),
  body('totals.delivery_fee').exists().isFloat({ min: 0 }),
  body('totals.autograt').exists().isFloat({ min: 0 }),
  body('totals.subtotal').exists().isFloat({ min: 0 }),
  body('totals.tax').exists().isFloat({ min: 0 }),
  body('totals.tip').exists().isFloat({ min: 0 }),
  body('totals.total').exists().isFloat({ min: 0 }),
  body('totals.balance').exists().isFloat({ min: 0 }),
  body('store_credit.amount_used').exists().isFloat({ min: 0 }),
  // { CID : [<quantity, {pid, modifiers: {MID: [<placement, OID>]}}]}
  //body('products').productsValidator(),
  body('sliced').isBoolean(),
  body('special_instructions').trim().escape()
];

export class OrderController implements IExpressController {
  public path = "/api/v1/order";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, V1OrderValidationChain, this.postOrder);
  };

  private postOrder = async (req: Request, res: Response, next: NextFunction) => {
    const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const response = await OrderManagerInstance.CreateOrder({
        cartDto: req.body.products,
        customer_email: req.body.user_email,
        customer_name: req.body.customer_name,
        nonce: req.body.nonce,
        service_option_enum: req.body.service_option,
        delivery_info: req.body.delivery_info,
        number_guests: req.body.number_guests || 1,
        phone_number: req.body.phonenum,
        referral: req.body.referral,
        website_metrics: {
          load_time: req.body.load_time,
          time_selection_time: req.body.time_selection_time,
          time_submit: req.body.submittime,
          ua: req.body.useragent,
          ip: (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress
        },
        service_date_string: req.body.service_date,
        service_time: req.body.service_time,
        sliced: req.body.sliced || false,
        special_instructions: req.body.special_instructions,
        store_credit: req.body.store_credit,
        totals: req.body.totals
      });
      res.status(response.status).json({ success: response.success, result: response.result });
    } catch(error) {
    GoogleProviderInstance.SendEmail(
      EMAIL_ADDRESS,
      { name: EMAIL_ADDRESS, address: "dave@windycitypie.com" },
      "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
      "dave@windycitypie.com",
      `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
    res.status(500).send(error);
    next(error)
  }
}

  private setDeliveryArea = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const json_from_body = { type: req.body.type, coordinates: req.body.coordinates };
    try {
      invariant.geojsonType(json_from_body, "Polygon", "delivery_area");
    }
    catch (e) {
      logger.info(`Got invalid polygon, validation error: ${e}`);
      return res.status(422).send(`Got invalid polygon, validation error: ${e}`);
    }
    DataProviderInstance.DeliveryArea = json_from_body;
    SocketIoProviderInstance.socketRO.emit('WCP_DELIVERY_AREA', DataProviderInstance.DeliveryArea);
    const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/`;
    res.setHeader('Location', location);
    return res.status(201).send(DataProviderInstance.DeliveryArea);
  } catch (error) {
    next(error)
  }
}
}