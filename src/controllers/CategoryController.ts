import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { CALL_LINE_DISPLAY, IAbstractExpression, OptionPlacement, OptionQualifier, PriceDisplay } from '@wcp/wcpshared';

import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import CatalogProviderInstance from '../config/catalog_provider';
const CategoryByIdValidationChain = [
  param('catid').trim().escape().exists().isMongoId(),
];

const CategoryValidationChain = [
  body('name').trim().exists(),
  body('description').trim(),
  body('subheading').trim(),
  body('footnotes').trim(),
  body('ordinal').exists().isInt({ min: 0 }),
  body('parent_id').trim().escape().isMongoId().optional({ nullable: true }),
  body('display_flags.call_line_name').trim().escape(),
  body('display_flags.call_line_display').isIn(Object.keys(CALL_LINE_DISPLAY))
];

const EditCategoryValidationChain = [
  ...CategoryByIdValidationChain,
  ...CategoryValidationChain
]

export class CategoryController implements IExpressController {
  public path = "/api/v1/menu/category";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, CategoryValidationChain, this.postCategory);
    this.router.patch(`${this.path}/:catid`, CheckJWT, ScopeWriteCatalog, EditCategoryValidationChain, this.patchCategory);
    this.router.delete(`${this.path}/:catid`, CheckJWT, ScopeDeleteCatalog, CategoryByIdValidationChain, this.deleteCategory);
  };
  private postCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const newcategory = await CatalogProviderInstance.CreateCategory({
        name: req.body.name,
        ordinal: req.body.ordinal,
        description: req.body.description,
        subheading: req.body.subheading,
        footnotes: req.body.footnotes,
        parent_id: req.body.parent_id,
        display_flags: req.body.display_flags
      });
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newcategory.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(newcategory);
    } catch (error) {
      next(error)
    }
  }

  private patchCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.UpdateCategory(
        req.params.catid,
        {
          name: req.body.name,
          ordinal: req.body.ordinal,
          description: req.body.description,
          subheading: req.body.subheading,
          footnotes: req.body.footnotes,
          parent_id: req.body.parent_id,
          display_flags: req.body.display_flags
        });
      if (!doc) {
        logger.info(`Unable to update category: ${req.params.catid}`);
        return res.status(404).send(`Unable to update category: ${req.params.catid}`);
      }
      logger.info(`Successfully updated ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.DeleteCategory(req.params.catid);
      if (!doc) {
        logger.info(`Unable to delete category: ${req.params.catid}`);
        return res.status(404).send(`Unable to delete category: ${req.params.catid}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }
}