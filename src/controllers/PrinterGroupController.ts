import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';

import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog, ScopeWriteOrders } from '../config/authorization';
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
  body('isExpo').toBoolean(true),
  body('singleItemPerTicket').toBoolean(true),
];

const EditPrinterGroupValidationChain = [
  ...PrinterGroupByIdValidationChain,
  ...PrinterGroupValidationChain
]

const DeleteAndReassignPrinterGroupValidationChain = [
  ...PrinterGroupByIdValidationChain,
  body('reassign').toBoolean(true),
  body('printerGroup').optional({nullable: true}).trim().escape().isMongoId(),
];


export class PrinterGroupController implements IExpressController {
  public path = "/api/v1/menu/printergroup";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}`, CheckJWT, ScopeWriteOrders, this.getPrinterGroups);
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteOrders, ScopeWriteCatalog, expressValidationMiddleware(PrinterGroupValidationChain), this.postPrinterGroup);
    this.router.patch(`${this.path}/:pgId`, CheckJWT, ScopeWriteOrders, ScopeWriteCatalog, expressValidationMiddleware(EditPrinterGroupValidationChain), this.patchPrinterGroup);
    this.router.delete(`${this.path}/:pgId`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(DeleteAndReassignPrinterGroupValidationChain), this.deletePrinterGroup);
  };

  private getPrinterGroups = async (_: Request, res: Response, __: NextFunction) => {
    return res.status(200).json(Object.values(CatalogProviderInstance.PrinterGroups));
  };

  private postPrinterGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.CreatePrinterGroup({
        name: req.body.name,
        externalIDs: req.body.externalIDs,
        singleItemPerTicket: req.body.singleItemPerTicket,
        isExpo: req.body.isExpo,
      });
      if (!doc) {
        logger.error(`Unable to create printer group`);
        return res.status(500).send(`Unable to create printer group`);
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
          singleItemPerTicket: req.body.singleItemPerTicket,
          isExpo: req.body.isExpo,
        }
      });
      if (!doc) {
        logger.info(`Unable to update PrinterGroup: ${req.params.pgId}`);
        return res.status(404).send(`Unable to update PrinterGroup: ${req.params.pgId}`);
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private deletePrinterGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reassign: boolean = req.body.reassign;
      const destinationPgId: string | null = req.body.printerGroup ?? null;
      if (reassign && !destinationPgId) {
        return res.status(400).send('Invalid request. Destination printer group ID required if reassigning items.');
      }
      const doc = await CatalogProviderInstance.DeletePrinterGroup(req.params.pgId, reassign, destinationPgId);
      if (!doc) {
        logger.info(`Unable to delete PrinterGroup: ${req.params.pgId}`);
        return res.status(404).send(`Unable to delete PrinterGroup: ${req.params.pgId}`);
      }
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }
}