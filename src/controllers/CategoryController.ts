import { Router, Request, Response, NextFunction } from 'express';
import { CALL_LINE_DISPLAY, CategoryDisplay } from '@wcp/wario-shared';

import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { CatalogProviderInstance } from '../config/catalog_provider';
import validationMiddleware from '../middleware/validationMiddleware';
import { CategoryIdParams, CategoryDto, DeleteCategoryDto } from '../dto/catalog/CategoryDtos';

export class CategoryController implements IExpressController {
  public path = "/api/v1/menu/category";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, validationMiddleware(CategoryDto), this.postCategory);
    this.router.patch(`${this.path}/:catid`, CheckJWT, ScopeWriteCatalog, validationMiddleware(CategoryIdParams, { source: 'params' }), validationMiddleware(CategoryDto), this.patchCategory);
    this.router.delete(`${this.path}/:catid`, CheckJWT, ScopeDeleteCatalog, validationMiddleware(CategoryIdParams, { source: 'params' }), validationMiddleware(DeleteCategoryDto), this.deleteCategory);
  };
  private postCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.CreateCategory({
        name: req.body.name,
        ordinal: req.body.ordinal,
        description: req.body.description,
        subheading: req.body.subheading,
        footnotes: req.body.footnotes,
        parent_id: req.body.parent_id,
        display_flags: req.body.display_flags,
        serviceDisable: req.body.serviceDisable
      });
      if (!doc) {
        logger.error(`Unable to create category`);
        return res.status(500).send(`Unable to create category`);
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private patchCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.UpdateCategory(
        req.params.catid,
        {
          name: req.body.name,
          ordinal: req.body.ordinal,
          description: req.body.description,
          subheading: req.body.subheading,
          footnotes: req.body.footnotes,
          parent_id: req.body.parent_id,
          display_flags: req.body.display_flags,
          serviceDisable: req.body.serviceDisable
        });
      if (!doc) {
        logger.info(`Unable to update category: ${req.params.catid}`);
        return res.status(404).send(`Unable to update category: ${req.params.catid}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const delete_contained_products = req.body.delete_contained_products ?? false;
      const doc = await CatalogProviderInstance.DeleteCategory(req.params.catid, delete_contained_products);
      if (!doc) {
        logger.info(`Unable to delete category: ${req.params.catid}`);
        return res.status(404).send(`Unable to delete category: ${req.params.catid}`);
      }
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }
}