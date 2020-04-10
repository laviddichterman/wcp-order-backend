// validates an address inside a delivery area

const Router = require('express').Router
const Client = require("@googlemaps/google-maps-services-js").Client;
const client = new Client({});
const turf = require('@turf/turf');
//const { check, validationResult } = require('express-validator');

module.exports = Router({ mergeParams: true })
  .get('/v1/addresses/validate', async (req, res, next) => {
    try {
      const address_line = req.query.address;
      const zipcode = req.query.zipcode;
      const city = req.query.city;
      const state = req.query.state;
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