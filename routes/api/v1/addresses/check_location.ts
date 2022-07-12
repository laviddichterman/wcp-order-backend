// validates an address inside a delivery area
import { Router, Request, Response, NextFunction } from 'express';
import { query, validationResult } from 'express-validator';
import { Client } from "@googlemaps/google-maps-services-js";
import turf from '@turf/turf';
const client = new Client({});

const ValidationChain = [  
  query('address').trim().escape().exists(),
  query('zipcode').trim().escape().exists(),
  query('city').trim().escape().exists(),
  query('state').trim().escape().exists(),
];


// uses the google maps services geocode api: https://developers.google.com/maps/documentation/javascript/geocoding#GeocodingAddressTypes
export const route = Router({ mergeParams: true })
  .get('/v1/addresses/validate', ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const address_line = req.query.address as string;
      const zipcode = req.query.zipcode as string;
      const city = req.query.city as string;
      const state = req.query.state as string;
      const DELIVERY_POLY = turf.polygon(req.db.DeliveryArea.coordinates);
      client.geocode( { 
        params: { 
          address: `${address_line} ${zipcode} ${city}, ${state}`,
          key: process.env.GOOGLEKEY
        },
        timeout: 2000 //ms
      }).then( r => {
        const result = r.data.results[0]; 
        const address_point = turf.point([
          result.geometry.location.lng, 
          result.geometry.location.lat]);
        const in_area = turf.booleanPointInPolygon(address_point, DELIVERY_POLY);
        const street_number_component = result.address_components.find(x => x.types[0] === "street_number");
        req.logger.info(`Found address ${result.formatted_address}. In area: ${in_area}`);
        res.status(200).json({ validated_address: result.formatted_address,
          in_area,
          found: 
            street_number_component != undefined && 
            address_line.indexOf(street_number_component.long_name) === 0,
          address_components: result.address_components
        });
      })
      .catch (e => {
        req.logger.error(e);
        res.status(500).json(e);
      })
    } catch (error) {
      next(error)
    }
  })

  module.exports = route;