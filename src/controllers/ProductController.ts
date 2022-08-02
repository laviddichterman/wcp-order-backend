import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { OptionPlacement, OptionQualifier, PriceDisplay } from '@wcp/wcpshared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import CatalogProviderInstance from '../config/catalog_provider';
const ProductClassByIdValidationChain = [
  param('pid').trim().escape().exists().isMongoId(), 
];

const ProductInstanceByIdValidationChain = [
  param('piid').trim().escape().exists().isMongoId(), 
];

const ProductClassValidationChain = [
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
  body('display_flags.flavor_max').isFloat({min: 0}),
  body('display_flags.bake_max').isFloat({min: 0}),
  body('display_flags.bake_differential').isFloat({min: 0}),
  // TODO: ensure show_name_of_base_product is TRUE if modifier list length === 0
  body('display_flags.show_name_of_base_product').toBoolean(true),
  body('display_flags.singular_noun').trim(),
  body('display_flags.order_guide.warnings.*').trim().escape().exists().isMongoId(), 
  body('display_flags.order_guide.suggestions.*').trim().escape().exists().isMongoId(), 
  body('ordinal').optional({nullable: true}).isInt({min: 0}),
  body('price.amount').isInt({ min: 0 }).exists(),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*.mtid').trim().escape().exists().isMongoId(),
  body('modifiers.*.enable').optional({nullable: true}).isMongoId(),
  body('modifiers.*.service_disable.*').isInt({min:0}),
  body('category_ids.*').trim().escape().exists().isMongoId(),
];

const AddProductClassValidationChain = [
  ...ProductClassValidationChain,
  body('create_product_instance').toBoolean(true),
  body('suppress_catalog_recomputation').toBoolean(true)
]

const EditProductClassValidationChain = [
  ...ProductClassByIdValidationChain,
  ...ProductClassValidationChain
];
const ProductInstanceValidationChain = [  
  ...ProductClassByIdValidationChain,
  body('display_name').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('is_base').toBoolean(true),
  body('display_flags.menu.ordinal').exists().isInt({min: 0}),
  body('display_flags.menu.hide').toBoolean(true),
  body('display_flags.menu.price_display').exists().isIn(Object.keys(PriceDisplay)),
  body('display_flags.menu.adornment').trim(),
  body('display_flags.menu.suppress_exhaustive_modifier_list').toBoolean(true),
  body('display_flags.menu.show_modifier_options').toBoolean(true),
  body('display_flags.order.ordinal').exists().isInt({min: 0}),
  body('display_flags.order.hide').toBoolean(true),
  body('display_flags.order.skip_customization').toBoolean(true),
  body('display_flags.order.price_display').exists().isIn(Object.keys(PriceDisplay)),
  body('display_flags.order.adornment').trim(),
  body('display_flags.order.suppress_exhaustive_modifier_list').toBoolean(true),
  body('ordinal').exists().isInt({min: 0}),
  body('modifiers.*.modifier_type_id').trim().escape().exists().isMongoId(),
  body('modifiers.*.options.*.option_id').trim().escape().exists().isMongoId(),
  body('modifiers.*.options.*.placement').exists().isIn(Object.keys(OptionPlacement)),
  body('modifiers.*.options.*.qualifier').exists().isIn(Object.keys(OptionQualifier))
];

const EditProductInstanceValidationChain = [  
  ...ProductInstanceByIdValidationChain,
  ...ProductInstanceValidationChain
];


export class ProductController implements IExpressController {
  public path = "/api/v1/menu/product";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(AddProductClassValidationChain), this.postProductClass);
    this.router.patch(`${this.path}/:pid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditProductClassValidationChain), this.patchProductClass);
    this.router.delete(`${this.path}/:pid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(ProductClassByIdValidationChain), this.deleteProductClass);
    this.router.post(`${this.path}:pid/`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(ProductInstanceValidationChain), this.postProductInstance);
    this.router.patch(`${this.path}/:pid/:piid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditProductInstanceValidationChain), this.patchProductInstance);
    this.router.delete(`${this.path}/:pid/:piid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware([...ProductClassByIdValidationChain, ...ProductInstanceByIdValidationChain]), this.deleteProductInstance);
  };
  private postProductClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
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
  }

  private patchProductClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.UpdateProduct(req.params.pid, {
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
      });
      if (!doc) {
        logger.info(`Unable to update Product: ${req.params.pid}`);
        return res.status(404).send(`Unable to update Product: ${req.params.pid}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deleteProductClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeleteProduct(req.params.pid);
      if (!doc) {
        logger.info(`Unable to delete Product: ${req.params.p_id}`);
        return res.status(404).send(`Unable to delete Product: ${req.params.pid}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private postProductInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.CreateProductInstance(req.params.pid, {
        description: req.body.description,
        display_name: req.body.display_name,
        shortcode: req.body.shortcode,
        ordinal: req.body.ordinal,
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        modifiers: req.body.modifiers,
        is_base: req.body.is_base,
        display_flags: req.body.display_flags
      });
      if (!doc) {
        logger.info(`Unable to find parent product id: ${req.params.pid} to create new product instance`);
        return res.status(404).send(`Unable to find parent product id: ${req.params.pid} to create new product instance`);
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private patchProductInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.UpdateProductInstance(req.params.pid, req.params.piid, {
        description: req.body.description,
        display_name: req.body.display_name,
        shortcode: req.body.shortcode,
        ordinal: req.body.ordinal,
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        modifiers: req.body.modifiers,
        is_base: req.body.is_base,
        display_flags: req.body.display_flags
      });
      if (!doc) {
        logger.info(`Unable to update ProductInstance: ${req.params.piid}`);
        return res.status(404).send(`Unable to update ProductInstance: ${req.params.piid}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deleteProductInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeleteProductInstance(req.params.piid);
      if (!doc) {
        logger.info(`Unable to delete ProductInstance Type: ${req.params.piid}`);
        return res.status(404).send(`Unable to delete ProductInstance: ${req.params.piid}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }


}