// creates a new product class in the catalog
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [
  body('display_name').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').custom((value) => {
    if (!value || (typeof value === 'object' && "start" in value && "end" in value && Number.isInteger(value.start) && Number.isInteger(value.end))) {
      return true;
    }
    throw new Error("Disabled value misformed");
  }),
  body('service_disable.*').isInt({min:0}),
  //body('permanent_disable').toBoolean(true),
  body('display_flags.flavor_max').isFloat({min: 0}),
  body('display_flags.bake_max').isFloat({min: 0}),
  body('display_flags.bake_differential').isFloat({min: 0}),
  // TODO: ensure show_name_of_base_product is TRUE if modifier list length === 0
  body('display_flags.show_name_of_base_product').toBoolean(true),
  body('display_flags.singular_noun').trim(),
  body('ordinal').optional({nullable: true}).isInt({min: 0}),
  body('price.amount').isInt({ min: 0 }).exists(),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*.mtid').trim().escape().exists().isMongoId(),
  body('modifiers.*.enable').optional({nullable: true}).isMongoId(),
  body('category_ids.*').trim().escape().exists().isMongoId(),
  body('create_product_instance').toBoolean(true),
  body('suppress_catalog_recomputation').toBoolean(true)
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/product', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const newproduct = await CatalogProviderInstance.CreateProduct({
        price: req.body.price,
        disabled: req.body.disabled ? req.body.disabled : null, 
        service_disable: req.body.service_disable || [],
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        modifiers: req.body.modifiers,
        category_ids: req.body.category_ids,
        display_flags: req.body.display_flags,
      }, 
      req.body.create_product_instance || req.body.suppress_catalog_recomputation // aka : suppress_catalog_recomputation
      );
      if (!newproduct) {
        logger.info(`Unable to find Modifiers or Categories to create Product`);
        return res.status(404).send("Unable to find Modifiers or Categories to create Product");
      }
      if (req.body.create_product_instance) {
        const pi = await CatalogProviderInstance.CreateProductInstance(newproduct.id, {
          description: req.body.description,
          display_name: req.body.display_name,
          shortcode: req.body.shortcode,
          ordinal: req.body.ordinal,
          externalIDs: {
            revelID: req.body.revelID,
            squareID: req.body.squareID
          },
          display_flags: {
            menu: { 
              ordinal: req.body.ordinal,
              hide: false,
              price_display: 'ALWAYS',
              adornment: "",
              suppress_exhaustive_modifier_list: false,
              show_modifier_options: false            
            },
            order: { 
              ordinal: req.body.ordinal,
              hide: false,
              skip_customization: false,
              price_display: 'ALWAYS',
              adornment: "",
              suppress_exhaustive_modifier_list: false
            }
          },
          modifiers: [],
          is_base: true
        });
        if (!pi) {
          logger.info(`Error while creating product instance for ${newproduct._id}.`);
          return res.status(500).send(`Error while creating product instance for  ${newproduct._id}.`);
        }
        const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newproduct._id}/${pi._id}`;
        res.setHeader('Location', location);
        return res.status(201).send({ product_instance: pi, product: newproduct });
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newproduct._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(newproduct);
    } catch (error) {
      next(error)
    }
  })