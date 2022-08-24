import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { IProduct, IProductInstance, OptionPlacement, OptionQualifier, PriceDisplay } from '@wcp/wcpshared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import CatalogProviderInstance from '../config/catalog_provider';
import { isValidDisabledValue } from '../types/Validations';

const ProductClassByIdValidationChain = [
  param('pid').trim().escape().exists().isMongoId(), 
];

const ProductInstanceByIdValidationChain = [
  param('piid').trim().escape().exists().isMongoId(), 
];

const ProductClassValidationChain = [
  body('displayName').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('externalIDs.*').trim().escape(),
  body('disabled').custom(isValidDisabledValue),
  body('serviceDisable.*').isInt({min:0}),
  body('displayFlags.flavor_max').isFloat({min: 0}),
  body('displayFlags.bake_max').isFloat({min: 0}),
  body('displayFlags.bake_differential').isFloat({min: 0}),
  // TODO: ensure show_name_of_base_product is TRUE if modifier list length === 0
  body('displayFlags.show_name_of_base_product').toBoolean(true),
  body('displayFlags.singular_noun').trim(),
  body('displayFlags.order_guide.warnings.*').trim().escape().exists().isMongoId(), 
  body('displayFlags.order_guide.suggestions.*').trim().escape().exists().isMongoId(), 
  body('ordinal').optional({nullable: true}).isInt({min: 0}),
  body('price.amount').isInt({ min: 0 }).exists(),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*.mtid').trim().escape().exists().isMongoId(),
  body('modifiers.*.enable').optional({nullable: true}).isMongoId(),
  body('modifiers.*.serviceDisable.*').trim().escape().isMongoId(),
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
  body('displayName').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('externalIDs.*').trim().escape(),
  body('isBase').toBoolean(true),
  body('displayFlags.menu.ordinal').exists().isInt({min: 0}),
  body('displayFlags.menu.hide').toBoolean(true),
  body('displayFlags.menu.price_display').exists().isIn(Object.keys(PriceDisplay)),
  body('displayFlags.menu.adornment').trim(),
  body('displayFlags.menu.suppress_exhaustive_modifier_list').toBoolean(true),
  body('displayFlags.menu.show_modifier_options').toBoolean(true),
  body('displayFlags.order.ordinal').exists().isInt({min: 0}),
  body('displayFlags.order.hide').toBoolean(true),
  body('displayFlags.order.skip_customization').toBoolean(true),
  body('displayFlags.order.price_display').exists().isIn(Object.keys(PriceDisplay)),
  body('displayFlags.order.adornment').trim(),
  body('displayFlags.order.suppress_exhaustive_modifier_list').toBoolean(true),
  body('ordinal').exists().isInt({min: 0}),
  body('modifiers').isArray(),
  body('modifiers.*.modifierTypeId').trim().escape().exists().isMongoId(),
  body('modifiers.*.options').isArray(),
  body('modifiers.*.options.*.option_id').trim().escape().exists().isMongoId(),
  body('modifiers.*.options.*.placement').exists().isIn(Object.values(OptionPlacement)),
  body('modifiers.*.options.*.qualifier').exists().isIn(Object.values(OptionQualifier))
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
    this.router.post(`${this.path}/:pid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(ProductInstanceValidationChain), this.postProductInstance);
    this.router.patch(`${this.path}/:pid/:piid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditProductInstanceValidationChain), this.patchProductInstance);
    this.router.delete(`${this.path}/:pid/:piid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware([...ProductClassByIdValidationChain, ...ProductInstanceByIdValidationChain]), this.deleteProductInstance);
  };
  private postProductClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productClass: Omit<IProduct, "id"> = {
        price: req.body.price,
        disabled: req.body.disabled ? req.body.disabled : null, 
        serviceDisable: req.body.serviceDisable || [],
        externalIDs: req.body.externalIDs,
        modifiers: req.body.modifiers,
        category_ids: req.body.category_ids,
        displayFlags: req.body.displayFlags,
      };
      const newproduct = await CatalogProviderInstance.CreateProduct(
        productClass, 
        req.body.create_product_instance || req.body.suppress_catalog_recomputation // aka : suppress_catalog_recomputation
      );
      if (!newproduct) {
        logger.info(`Unable to find Modifiers or Categories to create Product`);
        return res.status(404).send("Unable to find Modifiers or Categories to create Product");
      }
      if (req.body.create_product_instance) {
        const productInstance: Omit<IProductInstance, "id" | 'displayFlags' | 'externalIDs' | 'modifiers' | 'isBase'> = {
          productId: newproduct.id,
          description: req.body.description,
          displayName: req.body.displayName,
          shortcode: req.body.shortcode,
          ordinal: req.body.ordinal
        };
        const pi = await CatalogProviderInstance.CreateProductInstance({
          ...productInstance,
          externalIDs: {},
          displayFlags: {
            menu: { 
              ordinal: productInstance.ordinal,
              hide: false,
              price_display: PriceDisplay.ALWAYS,
              adornment: "",
              suppress_exhaustive_modifier_list: false,
              show_modifier_options: false            
            },
            order: { 
              ordinal: productInstance.ordinal,
              hide: false,
              skip_customization: false,
              price_display: PriceDisplay.ALWAYS,
              adornment: "",
              suppress_exhaustive_modifier_list: false
            }
          },
          modifiers: [],
          isBase: true
        });
        if (!pi) {
          logger.info(`Error while creating product instance for ${newproduct.id}.`);
          return res.status(500).send(`Error while creating product instance for  ${newproduct.id}.`);
        }
        const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newproduct.id}/${pi.id}`;
        res.setHeader('Location', location);
        return res.status(201).send({ product_instance: pi, product: newproduct });
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newproduct.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(newproduct);
    } catch (error) {
      next(error)
    }
  }

  private patchProductClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = req.params.pid;
      const doc = await CatalogProviderInstance.UpdateProduct(productId, {
        price: req.body.price,
        disabled: req.body.disabled ? req.body.disabled : null, 
        serviceDisable: req.body.serviceDisable || [],
        externalIDs: req.body.externalIDs,
        modifiers: req.body.modifiers,
        category_ids: req.body.category_ids,
        displayFlags: req.body.displayFlags,
      });
      if (!doc) {
        logger.info(`Unable to update Product: ${productId}`);
        return res.status(404).send(`Unable to update Product: ${productId}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deleteProductClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = req.params.pid;
      const doc = await CatalogProviderInstance.DeleteProduct(productId);
      if (!doc) {
        logger.info(`Unable to delete Product: ${productId}`);
        return res.status(404).send(`Unable to delete Product: ${productId}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private postProductInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.CreateProductInstance({
        productId: req.params.pid, 
        description: req.body.description,
        displayName: req.body.displayName,
        shortcode: req.body.shortcode,
        ordinal: req.body.ordinal,
        externalIDs: req.body.externalIDs,
        modifiers: req.body.modifiers,
        isBase: req.body.isBase,
        displayFlags: req.body.displayFlags
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
      const productInstanceId = req.params.piid;
      const doc = await CatalogProviderInstance.UpdateProductInstance(productInstanceId, {
        description: req.body.description,
        displayName: req.body.displayName,
        shortcode: req.body.shortcode,
        ordinal: req.body.ordinal,
        externalIDs: req.body.externalIDs,
        modifiers: req.body.modifiers,
        isBase: req.body.isBase,
        displayFlags: req.body.displayFlags
      });
      if (!doc) {
        logger.info(`Unable to update ProductInstance: ${productInstanceId}`);
        return res.status(404).send(`Unable to update ProductInstance: ${productInstanceId}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deleteProductInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productInstanceId = req.params.piid;
      const doc = await CatalogProviderInstance.DeleteProductInstance(productInstanceId);
      if (!doc) {
        logger.info(`Unable to delete ProductInstance Type: ${productInstanceId}`);
        return res.status(404).send(`Unable to delete ProductInstance: ${productInstanceId}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }


}