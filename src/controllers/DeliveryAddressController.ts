// validates an address inside a delivery area
// uses the google maps services geocode api: https://developers.google.com/maps/documentation/javascript/geocoding#GeocodingAddressTypes

import { Router, Request, Response, NextFunction } from 'express';
import { Client } from "@googlemaps/google-maps-services-js";
import * as turf from '@turf/turf'

import { DataProviderInstance } from '../config/dataprovider';
import logger from '../logging';
import IExpressController from '../types/IExpressController';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import { DeliveryAddressValidateRequest, DeliveryAddressValidateResponse } from '@wcp/wario-shared';
import { body } from 'express-validator';
import { isFulfillmentDefined } from '../types/Validations';

const client = new Client({});

const DeliveryAddressValidationChain = [
  body('fulfillmentId').trim().exists().isMongoId().custom(isFulfillmentDefined),
  body('address').trim().escape().exists(),
  body('zipcode').trim().escape().exists().isLength({ min: 5, max: 5 }),
  body('city').trim().escape().exists(),
  body('state').trim().escape().exists()
];

export class DeliveryAddressController implements IExpressController {
  public path = "/api/v1/addresses";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}`, expressValidationMiddleware(DeliveryAddressValidationChain), this.validateAddress);
    this.router.get(`${this.path}/validate`, expressValidationMiddleware(DeliveryAddressValidationChain), this.validateAddress);
    //this.router.post(`${this.path}`, CheckJWT, ScopeWriteKVStore, this.setDeliveryArea);
  };

  private validateAddress = async (req: Request, response: Response, next: NextFunction) => {
    try {
      const GOOGLE_GEOCODE_KEY = DataProviderInstance.KeyValueConfig.GOOGLE_GEOCODE_KEY;
      const reqBody: DeliveryAddressValidateRequest = {
        fulfillmentId: req.body.fulfillmentId,
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        zipcode: req.body.zipcode
      };
      const serviceArea = DataProviderInstance.Fulfillments[reqBody.fulfillmentId].serviceArea;
      if (!serviceArea) {
        // error out, cannot find fulfllment's serviceArea
        return response.status(404).send(`Unable to find delivery area for fulfillment: ${reqBody.fulfillmentId}`);
      }
      const DELIVERY_POLY = turf.polygon(serviceArea.coordinates);
      client.geocode( { 
        params: { 
          address: `${reqBody.address} ${reqBody.zipcode} ${reqBody.city}, ${reqBody.state}`,
          key: GOOGLE_GEOCODE_KEY
        },
        timeout: 2000 //ms
      }).then( r => {
        const result = r.data.results[0];
        const address_point = turf.point([
          result.geometry.location.lng,
          result.geometry.location.lat]);
        const in_area = turf.booleanPointInPolygon(address_point, DELIVERY_POLY);
        const street_number_component = result.address_components.find(x => x.types[0] === "street_number");
        logger.info(`Found address ${result.formatted_address}. In area: ${in_area}`);
        return response.status(200).json({
          validated_address: result.formatted_address,
          in_area,
          found:
            street_number_component != undefined &&
            reqBody.address.indexOf(street_number_component.long_name) === 0,
          address_components: result.address_components
        } as DeliveryAddressValidateResponse);
      })
        .catch(e => {
          logger.error(e);
          return response.status(500).json(e);
        })
      } catch (error) {
        return next(error)
      }
  }

  // private setDeliveryArea = async (req: Request, res: Response, next: NextFunction) => {
  //   try {
  //     const json_from_body = { type: req.body.type, coordinates: req.body.coordinates };
  //     try {
  //       turf.invariant.geojsonType(json_from_body, "Polygon", "delivery_area");
  //     }
  //     catch (e) {
  //       logger.info(`Got invalid polygon, validation error: ${e}`);
  //       return res.status(422).send(`Got invalid polygon, validation error: ${e}`);
  //     }
  //     DataProviderInstance.DeliveryArea = json_from_body;
  //     SocketIoProviderInstance.socketRO.emit('WCP_DELIVERY_AREA', DataProviderInstance.DeliveryArea);
  //     const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/`;
  //     res.setHeader('Location', location);
  //     return res.status(201).send(DataProviderInstance.DeliveryArea);
  //   } catch (error) {
  //     next(error)
  //   }
  // } 
}