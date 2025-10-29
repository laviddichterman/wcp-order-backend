import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { CURRENCY, IProduct, IProductDisplayFlags, OptionPlacement, OptionQualifier, PriceDisplay, type UpsertProductBatch} from '@wcp/wario-shared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { CatalogProviderInstance } from '../config/catalog_provider';
import { isFulfillmentDefined, isValidDisabledValue } from '../types/Validations';

const ProductClassesByIdsInBodyValidationChain = [
  body('pids').isArray({ min: 1 }),
  body('pids.*.').trim().escape().exists().isMongoId(),
];

const ProductClassByIdValidationChain = [
  param('pid').trim().escape().exists().isMongoId(),
];

const ProductInstanceByIdValidationChain = [
  param('piid').trim().escape().exists().isMongoId(),
];

const ProductInstanceValidationChain = (prefix: string) => [
  body(`${prefix}displayName`).trim().exists(),
  body(`${prefix}description`).trim(),
  body(`${prefix}shortcode`).trim().escape().exists().isLength({ min: 1 }),
  body(`${prefix}externalIDs`).isArray(),
  body(`${prefix}externalIDs.*.key`).exists().isLength({ min: 1 }),
  body(`${prefix}externalIDs.*.value`).exists(),
  body(`${prefix}displayFlags.pos.name`).optional({nullable: true}).trim(),
  body(`${prefix}displayFlags.pos.hide`).toBoolean(true),
  body(`${prefix}displayFlags.pos.skip_customization`).toBoolean(true),
  body(`${prefix}displayFlags.menu.ordinal`).exists().isInt({ min: 0 }),
  body(`${prefix}displayFlags.menu.hide`).toBoolean(true),
  body(`${prefix}displayFlags.menu.price_display`).exists().isIn(Object.keys(PriceDisplay)),
  body(`${prefix}displayFlags.menu.adornment`).trim(),
  body(`${prefix}displayFlags.menu.suppress_exhaustive_modifier_list`).toBoolean(true),
  body(`${prefix}displayFlags.menu.show_modifier_options`).toBoolean(true),
  body(`${prefix}displayFlags.order.ordinal`).exists().isInt({ min: 0 }),
  body(`${prefix}displayFlags.order.hide`).toBoolean(true),
  body(`${prefix}displayFlags.order.skip_customization`).toBoolean(true),
  body(`${prefix}displayFlags.order.price_display`).exists().isIn(Object.keys(PriceDisplay)),
  body(`${prefix}displayFlags.order.adornment`).trim(),
  body(`${prefix}displayFlags.order.suppress_exhaustive_modifier_list`).toBoolean(true),
  body(`${prefix}ordinal`).exists().isInt({ min: 0 }),
  body(`${prefix}modifiers`).isArray(),
  body(`${prefix}modifiers.*.modifierTypeId`).trim().escape().exists().isMongoId(),
  body(`${prefix}modifiers.*.options`).isArray(),
  body(`${prefix}modifiers.*.options.*.optionId`).trim().escape().exists().isMongoId(),
  body(`${prefix}modifiers.*.options.*.placement`).exists().isIn(Object.values(OptionPlacement)),
  body(`${prefix}modifiers.*.options.*.qualifier`).exists().isIn(Object.values(OptionQualifier))
];

const ProductClassValidationChain = (prefix: string) => [
  body(`${prefix}price.amount`).isInt({ min: 0 }).exists(),
  body(`${prefix}price.currency`).exists().isIn(Object.values(CURRENCY)),
  body(`${prefix}disabled`).custom(isValidDisabledValue),
  body(`${prefix}serviceDisable.*`).custom(isFulfillmentDefined),
  body(`${prefix}externalIDs`).isArray(),
  body(`${prefix}externalIDs.*.key`).exists().isLength({ min: 1 }),
  body(`${prefix}externalIDs.*.value`).exists(),
  body(`${prefix}modifiers.*.mtid`).trim().escape().exists().isMongoId(),
  body(`${prefix}modifiers.*.enable`).optional({ nullable: true }).isMongoId(),
  body(`${prefix}modifiers.*.serviceDisable.*`).custom(isFulfillmentDefined),
  body(`${prefix}category_ids.*`).trim().escape().exists().isMongoId(),
  body(`${prefix}displayFlags.flavor_max`).isFloat({ min: 0 }),
  body(`${prefix}displayFlags.bake_max`).isFloat({ min: 0 }),
  body(`${prefix}displayFlags.bake_differential`).isFloat({ min: 0 }),
  // TODO: ensure show_name_of_base_product is TRUE if modifier list length === 0
  body(`${prefix}displayFlags.show_name_of_base_product`).toBoolean(true),
  body(`${prefix}displayFlags.singular_noun`).trim(),
  body(`${prefix}displayFlags.is3p`).exists().toBoolean(true),
  body(`${prefix}displayFlags.order_guide.warnings.*`).trim().escape().exists().isMongoId(),
  body(`${prefix}displayFlags.order_guide.suggestions.*`).trim().escape().exists().isMongoId(),
  body(`${prefix}printerGroup`).optional({ nullable: true }).isMongoId(),
  // TODO need proper deep validation of availability and timing fields
  body(`${prefix}availbility`).optional({ nullable: true }).isArray(),
  body(`${prefix}availbility.*`).isObject(),
  body(`${prefix}timing`).optional({ nullable: true }).isObject(),
];

const AddProductClassValidationChain = (prefix: string) => [
  ...ProductClassValidationChain(`${prefix}.product.`),
  body(`${prefix}.instances`).isArray({ min: 1 }),
  ...ProductInstanceValidationChain(`${prefix}.instances.*.`)
];

const BatchAddProductClassValidationChain = [
  body().isArray({min: 1}),
  ...AddProductClassValidationChain('*')
];

const EditProductClassValidationChain = [
  ...ProductClassByIdValidationChain,
  ...ProductClassValidationChain('')
];

const AddProductInstanceValidationChain = [
  ...ProductClassByIdValidationChain,
  ...ProductInstanceValidationChain("")
];


const EditProductInstanceValidationChain = [
  ...ProductInstanceByIdValidationChain,
  ...ProductInstanceValidationChain("")
];


export class ProductController implements IExpressController {
  public path = "/api/v1/menu/product";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(AddProductClassValidationChain('')), this.postProductClass);
    this.router.post(`${this.path}batch`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(BatchAddProductClassValidationChain), this.batchPostProducts);
    this.router.patch(`${this.path}/:pid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditProductClassValidationChain), this.patchProductClass);
    this.router.delete(`${this.path}/:pid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(ProductClassByIdValidationChain), this.deleteProductClass);
    this.router.post(`${this.path}batch/batchDelete`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(ProductClassesByIdsInBodyValidationChain), this.batchDeleteProductClasses);
    this.router.post(`${this.path}/:pid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(AddProductInstanceValidationChain), this.postProductInstance);
    this.router.patch(`${this.path}/:pid/:piid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditProductInstanceValidationChain), this.patchProductInstance);
    this.router.delete(`${this.path}/:pid/:piid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware([...ProductClassByIdValidationChain, ...ProductInstanceByIdValidationChain]), this.deleteProductInstance);
  };
  private postProductClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productClass: Omit<IProduct, 'id' | 'baseProductId'> = {
        price: req.body.product.price,
        disabled: req.body.product.disabled ? req.body.disabled : null,
        serviceDisable: req.body.product.serviceDisable || [],
        externalIDs: req.body.product.externalIDs,
        modifiers: req.body.product.modifiers,
        category_ids: req.body.product.category_ids,
        displayFlags: req.body.product.displayFlags,
        printerGroup: req.body.product.printerGroup ?? null,
        availability: req.body.product.availability,
        timing: req.body.product.timing,
      };
      const instances = req.body.instances;
      const createProductResult = await CatalogProviderInstance.CreateProduct(
        productClass,
        instances
      );
      if (!createProductResult) {
        const errorDetail = `Unable to satisfy prerequisites to create Product and instances`;
        logger.info(errorDetail);
        return res.status(404).send(errorDetail);
      }

      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${createProductResult.product.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(createProductResult);
    } catch (error) {
      return next(error)
    }
  }

  private batchPostProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const batches: UpsertProductBatch[] = req.body;
      const createBatchesResult = await CatalogProviderInstance.BatchUpsertProduct(batches);
      if (!createBatchesResult) {
        const errorDetail = `Unable to satisfy prerequisites to create Product(s) and instance(s)`;
        logger.info(errorDetail);
        return res.status(404).send(errorDetail);
      }
      return res.status(201).send(createBatchesResult);
    } catch (error) {
      return next(error)
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
        printerGroup: req.body.printerGroup ?? null,
        availability: req.body.availability,
        timing: req.body.timing,
      });
      if (!doc) {
        logger.info(`Unable to update Product: ${productId}`);
        return res.status(404).send(`Unable to update Product: ${productId}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private batchDeleteProductClasses = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productIds = req.body.pids;
      const doc = await CatalogProviderInstance.BatchDeleteProduct(productIds);
      if (!doc) {
        logger.info(`Unable to delete Products: ${productIds.join(', ')}`);
        return res.status(404).send(`Unable to delete Products: ${productIds.join(', ')}`);
      }
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
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
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private postProductInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const displayFlags = { 
        pos: {
          hide: req.body.displayFlags.pos.hide,
          name: req.body.displayFlags.pos.name,
          skip_customization: req.body.displayFlags.pos.skip_customization
        },
        menu: {
          adornment: req.body.displayFlags.menu.adornment,
          hide: req.body.displayFlags.menu.hide,
          ordinal: req.body.displayFlags.menu.ordinal,
          price_display: req.body.displayFlags.menu.price_display,
          show_modifier_options: req.body.displayFlags.menu.show_modifier_options,
          suppress_exhaustive_modifier_list: req.body.displayFlags.menu.suppress_exhaustive_modifier_list,
        },
        order: {
          adornment: req.body.displayFlags.order.adornment,
          hide: req.body.displayFlags.order.hide,
          ordinal: req.body.displayFlags.order.ordinal,
          price_display: req.body.displayFlags.order.price_display,
          skip_customization: req.body.displayFlags.order.skip_customization,
          suppress_exhaustive_modifier_list: req.body.displayFlags.order.suppress_exhaustive_modifier_list,
        }
      } satisfies IProductDisplayFlags
      const doc = await CatalogProviderInstance.CreateProductInstance({
        productId: req.params.pid,
        description: req.body.description,
        displayName: req.body.displayName,
        shortcode: req.body.shortcode,
        ordinal: req.body.ordinal,
        externalIDs: req.body.externalIDs ?? [],
        modifiers: req.body.modifiers,
        displayFlags
      });
      if (!doc) {
        logger.info(`Unable to find parent product id: ${req.params.pid} to create new product instance`);
        return res.status(404).send(`Unable to find parent product id: ${req.params.pid} to create new product instance`);
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private patchProductInstance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productInstanceId = req.params.piid;
      const product = CatalogProviderInstance.Catalog.products[req.params.pid]!.product;
      const doc = await CatalogProviderInstance.UpdateProductInstance({
        piid: productInstanceId,
        product: {
          modifiers: product.modifiers, 
          price: product.price,
          printerGroup: product.printerGroup,
          disabled: product.disabled,
          displayFlags: product.displayFlags
        },
        productInstance: {
          description: req.body.description,
          displayName: req.body.displayName,
          shortcode: req.body.shortcode,
          ordinal: req.body.ordinal,
          externalIDs: req.body.externalIDs,
          modifiers: req.body.modifiers,
          displayFlags: req.body.displayFlags
        }
      });
      if (!doc) {
        logger.info(`Unable to update ProductInstance: ${productInstanceId}`);
        return res.status(404).send(`Unable to update ProductInstance: ${productInstanceId}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
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
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }


}