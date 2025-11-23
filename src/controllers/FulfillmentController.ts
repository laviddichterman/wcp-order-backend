import { Router, Request, Response, NextFunction } from 'express';
import { FulfillmentConfig, FulfillmentType } from '@wcp/wario-shared';

import validationMiddleware from '../middleware/validationMiddleware';
import { FulfillmentIdParams, FulfillmentDto } from '../dto/catalog/FulfillmentDtos';
import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { DataProviderInstance } from '../config/dataprovider';
import { SocketIoProviderInstance } from '../config/socketio_provider';
import { CatalogProviderInstance } from '../config/catalog_provider';


export class FulfillmentController implements IExpressController {
  public path = "/api/v1/config/fulfillment";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, validationMiddleware(FulfillmentDto), this.postFulfillment);
    this.router.patch(`${this.path}/:fid`, CheckJWT, ScopeWriteCatalog, validationMiddleware(FulfillmentIdParams, { source: 'params' }), validationMiddleware(FulfillmentDto), this.patchFulfillment);
    this.router.delete(`${this.path}/:fid`, CheckJWT, ScopeDeleteCatalog, validationMiddleware(FulfillmentIdParams, { source: 'params' }), this.deleteFulfillment);
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