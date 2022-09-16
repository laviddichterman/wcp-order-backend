import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { IAbstractExpression, WFunctional } from '@wcp/wcpshared';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';

import logger from '../logging';

import IExpressController from '../types/IExpressController';
import HttpException from '../types/HttpException';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { CatalogProviderInstance } from '../config/catalog_provider';
const PIFByIdValidationChain = [
  param('fxnid').trim().escape().exists().isMongoId(),
];

const PIFValidationChain = [
  body('name').trim().exists(),
  body('expression').exists()
];

const EditPIFValidationChain = [
  ...PIFByIdValidationChain,
  ...PIFValidationChain
]

export class ProductInstanceFunctionController implements IExpressController {
  public path = "/api/v1/query/language/productinstancefunction";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(PIFValidationChain), this.postPIF);
    this.router.patch(`${this.path}/:fxnid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditPIFValidationChain), this.patchPIF);
    this.router.delete(`${this.path}/:fxnid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(PIFByIdValidationChain), this.deletePIF);
  };
  private postPIF = async (req: Request, res: Response, next: NextFunction) => {
    try {
      try {
        const stringified = WFunctional.AbstractExpressionStatementToString(req.body.expression, CatalogProviderInstance.CatalogSelectors)
        logger.info(`Creating expression with ${stringified}`);
      }
      catch (e) {
        next(new HttpException(400, "Expression invalid"));
      }
      const doc = await CatalogProviderInstance.CreateProductInstanceFunction({
        name: req.body.name as string,
        expression: req.body.expression as IAbstractExpression
      });
      if (!doc) {
        logger.info('Unable to create ProductInstanceFunction as requested.');
        return res.status(500).send("Unable to create ProductInstanceFunction as requested.");
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private patchPIF = async (req: Request, res: Response, next: NextFunction) => {
    try {
      try {
        const stringified = WFunctional.AbstractExpressionStatementToString(req.body.expression, CatalogProviderInstance.CatalogSelectors)
        logger.info(`Updating expression with ${stringified}`);
      }
      catch (e) {
        next(new HttpException(400, "Expression invalid"));
      }
      const doc = await CatalogProviderInstance.UpdateProductInstanceFunction(req.params.fxnid, {
        name: req.body.name as string,
        expression: req.body.expression as IAbstractExpression
      });
      if (!doc) {
        logger.info(`Unable to update ProductInstanceFunction: ${req.params.fxnid}`);
        return res.status(404).send(`Unable to update ProductInstanceFunction: ${req.params.fxnid}`);;
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deletePIF = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeleteProductInstanceFunction(req.params.fxnid);
      if (!doc) {
        logger.info(`Unable to delete ProductInstanceFunction: ${req.params.fxnid}`);
        return res.status(404).send(`Unable to delete ProductInstanceFunction: ${req.params.fxnid}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }
}