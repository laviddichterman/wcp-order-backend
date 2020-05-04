// creates a new option type in the catalog
const Router = require('express').Router
const { body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

/*   
  _id: { type: String, required: true },

  // Human readable name
  name: { type: String, required: true },

  // external ids
  externalIDs: ExternalIDsSchema,

  // ordinal
  ordinal: { type: Number, required: true },
  
  // selection type
  selection_type: {
    type: String,
    enum: ['SINGLE', 'MANY'],
    required: true
  }
*/

const ValidationChain = [  
  body('name').trim().escape().exists(),
  body('ordinal').isInt({min: 0, max:64}).exists(),
  body('selection_type').exists().isIn(['SINGLE', 'MANY']),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/option/', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const newoptiontype = await req.catalog.CreateOptionType({
        name: req.body.name,
        ordinal: req.body.ordinal,
        selection_type: req.body.selection_type,
        revelID: req.body.revelID,
        squareID: req.body.squareID
      });
      const location = `${req.base}${req.originalUrl}/${newoptiontype.id}`;
      res.setHeader('Location', location);
      res.status(201).send(newoptiontype);
    } catch (error) {
      next(error)
    }
  })