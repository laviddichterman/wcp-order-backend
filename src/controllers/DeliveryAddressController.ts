// validates an address inside a delivery area
// uses the google maps services geocode api: https://developers.google.com/maps/documentation/javascript/geocoding#GeocodingAddressTypes

import { Router, Request, Response, NextFunction } from 'express';
import { Client } from "@googlemaps/google-maps-services-js";
import * as turf from '@turf/turf'

import DataProviderInstance, { DataProvider } from '../config/dataprovider';
import SocketIoProviderInstance from '../config/socketio_provider';
import logger from '../logging';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeWriteKVStore } from '../config/authorization';
import { DeliveryAddressValidateRequest, DeliveryAddressValidateResponse } from '@wcp/wcpshared';

const client = new Client({});

export class DeliveryAddressController implements IExpressController {
  public path = "/api/v1/addresses";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}`, this.validateAddress);
    this.router.get(`${this.path}/validate`, this.validateAddress);
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteKVStore, this.setDeliveryArea);
  };

  private validateAddress = async (req: Request, response: Response, next: NextFunction) => {
    try {
      const GOOGLE_GEOCODE_KEY = DataProviderInstance.KeyValueConfig.GOOGLE_GEOCODE_KEY;
      const typedQuery = req.query as unknown as DeliveryAddressValidateRequest;
      const DELIVERY_POLY = turf.polygon(DataProviderInstance.DeliveryArea.coordinates);
      client.geocode( { 
        params: { 
          address: `${typedQuery.address} ${typedQuery.zipcode} ${typedQuery.city}, ${typedQuery.state}`,
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
        response.status(200).json({
          validated_address: result.formatted_address,
          in_area,
          found:
            street_number_component != undefined &&
            typedQuery.address.indexOf(street_number_component.long_name) === 0,
          address_components: result.address_components
        } as DeliveryAddressValidateResponse);
      })
        .catch(e => {
          logger.error(e);
          response.status(500).json(e);
        })
      } catch (error) {
        next(error)
      }
  }

  private setDeliveryArea = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const json_from_body = { type: req.body.type, coordinates: req.body.coordinates };
      try {
        turf.invariant.geojsonType(json_from_body, "Polygon", "delivery_area");
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