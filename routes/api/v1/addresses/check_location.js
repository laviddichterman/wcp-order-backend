// creates a new location with no assigned sensors

const Router = require('express').Router
const Client = require("@googlemaps/google-maps-services-js").Client;
const client = new Client({});
const DELIVERY_AREA = require('../../../../data/deliveryarea.wcp');
const turf = require('@turf/turf');
//const { check, validationResult } = require('express-validator');


const DELIVERY_POLY = turf.polygon(DELIVERY_AREA.features[0].geometry.coordinates);

module.exports = Router({ mergeParams: true })
  .get('/v1/addresses/validate', async (req, res, next) => {
    try {
      const address_line = req.query.address;
      const zipcode = req.query.zipcode;
      const city = req.query.city;
      const state = req.query.state;
      client.geocode( { 
        params: { 
          address: `${address_line} ${zipcode} ${city}, ${state}`,
          key: process.env.GOOGLEKEY
        },
        timeout: 1000 //ms
      }).then( r => {
        const result = r.data.results[0]; 
        console.log(result.address_components[0]);
        const address_point = turf.point([
          result.geometry.location.lng, 
          result.geometry.location.lat]);
        const in_area = turf.booleanPointInPolygon(address_point, DELIVERY_POLY);
        res.status(200).send({ validated_address: result.formatted_address,
          in_area,
          found: 
            result.address_components[0].types[0] === "street_number" && 
            address_line.indexOf(result.address_components[0].long_name) === 0
        });
      })
      .catch (e => {
        console.log(e);
        res.status(500).send(e);
      })
    } catch (error) {
      next(error)
    }
  })