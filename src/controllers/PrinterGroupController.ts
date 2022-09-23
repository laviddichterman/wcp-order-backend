import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';

import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { CatalogProviderInstance } from '../config/catalog_provider';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';

const PrinterGroupByIdValidationChain = [
  param('pgId').trim().escape().exists().isMongoId(),
];

const PrinterGroupValidationChain = [
  body('name').trim().exists(),
  body('externalIDs').isArray(),
  body('externalIDs.*.key').exists(),
  body('externalIDs.*.value').exists(),
  body('singleItemPerTicket').toBoolean(true),
];

const EditPrinterGroupValidationChain = [
  ...PrinterGroupByIdValidationChain,
  ...PrinterGroupValidationChain
]

export class PrinterGroupController implements IExpressController {
  public path = "/api/v1/menu/printergroup";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(PrinterGroupValidationChain), this.postPrinterGroup);
    this.router.patch(`${this.path}/:catid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditPrinterGroupValidationChain), this.patchPrinterGroup);
    this.router.delete(`${this.path}/:catid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(PrinterGroupByIdValidationChain), this.deletePrinterGroup);
  };
  private postPrinterGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.CreatePrinterGroup({
        name: req.body.name,
        externalIDs: req.body.externalIDs,
        singleItemPerTicket: req.body.singleItemPerTicket
      });
      if (!doc) {
        logger.error(`Unable to create printer group`);
        return res.status(500).send(`Unable to printer group`);
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private patchPrinterGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.UpdatePrinterGroup({
        id: req.params.pgId,
        printerGroup: {
          name: req.body.name,
          externalIDs: req.body.externalIDs,
          singleItemPerTicket: req.body.singleItemPerTicket
        }
      });
      if (!doc) {
        logger.info(`Unable to update PrinterGroup: ${req.params.catid}`);
        return res.status(404).send(`Unable to update PrinterGroup: ${req.params.catid}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private deletePrinterGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeletePrinterGroup(req.params.catid);
      if (!doc) {
        logger.info(`Unable to delete PrinterGroup: ${req.params.catid}`);
        return res.status(404).send(`Unable to delete PrinterGroup: ${req.params.catid}`);
      }
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }
}