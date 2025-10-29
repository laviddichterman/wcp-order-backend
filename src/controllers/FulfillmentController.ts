import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { FulfillmentConfig, FulfillmentType } from '@wcp/wario-shared';

import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { DataProviderInstance } from '../config/dataprovider';
import { SocketIoProviderInstance } from '../config/socketio_provider';
import { CatalogProviderInstance } from '../config/catalog_provider';


const FulfillmentConfigByIdValidationChain = [
  param('fid').trim().escape().exists().isMongoId(), 
];

const FulfillmentValidationChain = [
  body('displayName').trim().exists(),
  body('shortcode').trim().escape().exists(),
  body('ordinal').isInt({min: 0}),
  body('exposeFulfillment').exists().isBoolean({ strict: true }),
  body('service').exists().isIn(Object.keys(FulfillmentType)),
  body('terms').isArray().exists(),
  body('terms.*').trim(),
  body('messages.DESCRIPTION').isString().trim().optional({nullable: true}),
  body('messages.CONFIRMATION').isString().trim().exists(),
  body('messages.INSTRUCTIONS').isString().trim().exists(),
  body('menuBaseCategoryId').trim().escape().exists().isMongoId(),
  body('orderBaseCategoryId').trim().escape().exists().isMongoId(),
  body('orderSupplementaryCategoryId').trim().optional({nullable: true}).isMongoId(),
  body('requirePrepayment').exists().isBoolean({ strict: true }),
  body('allowPrepayment').exists().isBoolean({ strict: true }),
  body('allowTipping').exists().isBoolean({ strict: true }),
  body('autograt.function').optional({nullable: true}).isMongoId(),
  body('autograt.percentage').optional({nullable: true}).isFloat({ gt: 0 }),
  body('serviceCharge').optional({nullable: true}).isMongoId(),
  body('leadTime').exists().isInt({min: 1}),
  body('leadTimeOffset').exists().isInt({min: -100, max: 1440}),
  body('operatingHours').isObject().exists(),
  body('operatingHours.*').isArray(),
  body('operatingHours.*.*.start').isInt({ min: 0, max: 1440 }),
  body('operatingHours.*.*.end').isInt({ min: 0, max: 1440 }),
  body('specialHours').exists().isArray(),
  body('specialHours.*.key').isISO8601(),
  body('specialHours.*.value').isArray(),
  body('specialHours.*.value.*.start').isInt({ min: 0, max: 1440 }),
  body('specialHours.*.value.*.end').isInt({ min: 0, max: 1440 }),
  body('blockedOff').exists().isArray(),
  body('blockedOff.*.key').isISO8601(),
  body('blockedOff.*.value.*.start').isInt({ min: 0, max: 1440 }),
  body('blockedOff.*.value.*.end').isInt({ min: 0, max: 1440 }) ,
  body('minDuration').exists().isInt({ min: 0 }),
  body('maxDuration').exists().isInt({ min: 0 }),
  body('timeStep').exists().isInt({ min: 1 }),
  body('maxGuests').optional({nullable: true}).isInt({ min: 0 }),
  body('serviceArea').optional({nullable: true})
];

const EditFulfillmentValidationChain = [
  ...FulfillmentConfigByIdValidationChain,
  ...FulfillmentValidationChain
];

export class FulfillmentController implements IExpressController {
  public path = "/api/v1/config/fulfillment";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(FulfillmentValidationChain), this.postFulfillment);
    this.router.patch(`${this.path}/:fid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditFulfillmentValidationChain), this.patchFulfillment);
    this.router.delete(`${this.path}/:fid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(FulfillmentConfigByIdValidationChain), this.deleteFulfillment);
  };
  private postFulfillment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fulfillment: Omit<FulfillmentConfig, "id"> = {
        displayName: req.body.displayName,
        shortcode: req.body.shortcode,
        exposeFulfillment: req.body.exposeFulfillment,
        ordinal: req.body.ordinal,
        service: req.body.service,
        terms: req.body.terms,
        messages: req.body.messages,
        menuBaseCategoryId: req.body.menuBaseCategoryId,
        orderBaseCategoryId: req.body.orderBaseCategoryId,
        orderSupplementaryCategoryId: req.body.orderSupplementaryCategoryId,
        requirePrepayment: req.body.requirePrepayment,
        allowPrepayment: req.body.allowPrepayment, 
        allowTipping: req.body.allowTipping, 
        autograt: req.body.autograt,
        serviceCharge: req.body.serviceCharge,
        leadTime: req.body.leadTime,
        leadTimeOffset: req.body.leadTimeOffset,
        
        operatingHours: req.body.operatingHours,
        specialHours: req.body.specialHours,
        blockedOff: req.body.blockedOff,

        minDuration: req.body.minDuration,
        maxDuration: req.body.maxDuration,
        timeStep: req.body.timeStep,
        maxGuests: req.body.maxGuests,
        serviceArea: req.body.serviceArea
      };
      DataProviderInstance.setFulfillment(fulfillment)
      .then(async (newFulfillment) => {
        await DataProviderInstance.syncFulfillments();
        await SocketIoProviderInstance.EmitFulfillments(DataProviderInstance.Fulfillments);
        const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newFulfillment._id}`;
        res.setHeader('Location', location);
        return res.status(201).send(newFulfillment);
      })
      .catch(err => {
        const message = `Unable to create new Fulfillment instance from ${JSON.stringify(fulfillment)}, got error: ${JSON.stringify(err)}`;
        logger.error(message);
        return res.status(400).send(message);
      });
    } catch (error) {
      next(error)
    }
  }

  private patchFulfillment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fulfillmentId = req.params.fid;
      const fulfillment: Omit<FulfillmentConfig, "id"> = {
        displayName: req.body.displayName,
        shortcode: req.body.shortcode,
        exposeFulfillment: req.body.exposeFulfillment,
        ordinal: req.body.ordinal,
        service: req.body.service,
        terms: req.body.terms,
        messages: req.body.messages,
        menuBaseCategoryId: req.body.menuBaseCategoryId,
        orderBaseCategoryId: req.body.orderBaseCategoryId,
        orderSupplementaryCategoryId: req.body.orderSupplementaryCategoryId,
        requirePrepayment: req.body.requirePrepayment,
        allowPrepayment: req.body.allowPrepayment, 
        allowTipping: req.body.allowTipping, 
        autograt: req.body.autograt,
        serviceCharge: req.body.serviceCharge,
        leadTime: req.body.leadTime,
        leadTimeOffset: req.body.leadTimeOffset,
        
        operatingHours: req.body.operatingHours,
        specialHours: req.body.specialHours,
        blockedOff: req.body.blockedOff,

        minDuration: req.body.minDuration,
        maxDuration: req.body.maxDuration,
        timeStep: req.body.timeStep,
        maxGuests: req.body.maxGuests,
        serviceArea: req.body.serviceArea
      };
      DataProviderInstance.updateFulfillment(fulfillmentId, fulfillment)
      .then(async(updatedFulfillment) => {
        logger.info(`Successfully updated Fulfillment: ${JSON.stringify(updatedFulfillment)}`);
        await DataProviderInstance.syncFulfillments();
        await SocketIoProviderInstance.EmitFulfillments(DataProviderInstance.Fulfillments);
        return res.status(200).send(updatedFulfillment);
      })
      .catch(err => {
        const message = `Unable to update Fulfillment instance with ${JSON.stringify(fulfillment)}, got error: ${JSON.stringify(err)}`;
        logger.error(message);
        return res.status(404).send(message);
      });
    } catch (error) {
      next(error)
    }
  }

  private deleteFulfillment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fulfillmentId = req.params.fid;
      await CatalogProviderInstance.BackfillRemoveFulfillment(fulfillmentId);
      DataProviderInstance.deleteFulfillment(fulfillmentId)
      .then(async (doc) => {
        logger.info(`Successfully deleted Fulfillment ${doc}`);
        await DataProviderInstance.syncFulfillments();
        SocketIoProviderInstance.EmitFulfillments(DataProviderInstance.Fulfillments);
        return res.status(200).send(doc);
      })
      .catch((err) => {
        const errorMessage = `Unable to delete Fulfillment with ID: ${req.params.fid}, got error: ${JSON.stringify(err)}`;
        logger.error(errorMessage);
        return res.status(400).send(errorMessage);
      })
    } catch (error) {
      next(error)
    }
  }
}