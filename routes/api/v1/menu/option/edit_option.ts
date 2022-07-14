// edits an option in the catalog
// TODO: double check that fields not passed aren't removed. make it so fields that aren't present in the 
import { Router, Request, Response, NextFunction } from 'express';
import { param, body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [  
  // kinda wonky since you could potentially re-assign the modifier type here, but it's in the path
  // but we're not allowing re-assigning of the modifier type, for now.
  param('mt_id').trim().escape().exists().isMongoId(), 
  param('mo_id').trim().escape().exists().isMongoId(),
  body('display_name').trim(),
  body('description').trim(),
  body('shortcode').trim().escape(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').custom((value) => {
    if (!value || (typeof value === 'object' && "start" in value && "end" in value && Number.isInteger(value.start) && Number.isInteger(value.end))) {
      return true;
    }
    throw new Error("Disabled value misformed");
  }),
  // TODO: what doin with this? body('permanent_disable').isBoolean(true),
  body('price.amount').isInt({min: 0}),
  body('price.currency').isLength({min:3, max: 3}).isIn(['USD']),
  body('ordinal').isInt({min: 0, max:64}),
  body('enable_function').optional({nullable: true}).isMongoId(),
  body('flavor_factor').isFloat({ min: 0, max: 5 }),
  body('bake_factor').isFloat({ min: 0, max: 5 }),
  // don't sanitize this to boolean, but validate that it is a boolean
  body('can_split').isBoolean({ strict: true }), 
  body('display_flags.omit_from_shortname').toBoolean(true),
  body('display_flags.omit_from_name').toBoolean(true),
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/option/:mt_id/:mo_id', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.UpdateModifierOption(req.params.mo_id, {
        display_name: req.body.display_name, 
        description: req.body.description, 
        price: req.body.price, 
        shortcode: req.body.shortcode, 
        disabled: req.body.disabled ? req.body.disabled : null, 
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        ordinal: req.body.ordinal, 
        metadata: {
          flavor_factor: req.body.flavor_factor, 
          bake_factor: req.body.bake_factor, 
          can_split: req.body.can_split, 
        },
        enable_function: req.body.enable_function,
        display_flags: req.body.display_flags,
      });
      if (!doc) {
        logger.info(`Unable to update ModifierOption: ${req.params.mo_id}`);
        return res.status(404).send(`Unable to update ModifierOption: ${req.params.mo_id}`);;
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })