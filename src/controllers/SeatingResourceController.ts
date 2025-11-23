import { Router, Request, Response, NextFunction } from 'express';
import { SeatingResource, SeatingShape } from '@wcp/wario-shared';

import validationMiddleware from '../middleware/validationMiddleware';
import { SeatingResourceIdParams, SeatingResourceDto } from '../dto/catalog/SeatingResourceDtos';
import logger from '../logging';

import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { DataProviderInstance } from '../config/dataprovider';
import { SocketIoProviderInstance } from '../config/socketio_provider';
import { CatalogProviderInstance } from '../config/catalog_provider';

export class SeatingResourceController implements IExpressController {
  public path = "/api/v1/config/seating";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, validationMiddleware(SeatingResourceDto), this.postSeatingResource);
    this.router.patch(`${this.path}/:srid`, CheckJWT, ScopeWriteCatalog, validationMiddleware(SeatingResourceIdParams, { source: 'params' }), validationMiddleware(SeatingResourceDto), this.patchSeatingResource);
    this.router.delete(`${this.path}/:srid`, CheckJWT, ScopeDeleteCatalog, validationMiddleware(SeatingResourceIdParams, { source: 'params' }), this.deleteSeatingResource);
  };
  private postSeatingResource = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const seatingResource: Omit<SeatingResource, "id"> = {
        name: req.body.name,
        capacity: req.body.capacity,
        shape: req.body.shape,
        sectionId: req.body.sectionId,
        center: { 
          x: req.body.center.x,
          y: req.body.center.y
        },
        shapeDims: { 
          x: req.body.shapeDims.x,
          y: req.body.shapeDims.y
        },
        rotation: req.body.rotation, 
        disabled: req.body.disabled || false
      };
      DataProviderInstance.setSeatingResource(seatingResource)
      .then(async (newSeatingResource) => {
        await DataProviderInstance.syncSeatingResources();
        await SocketIoProviderInstance.EmitSeatingResources(DataProviderInstance.SeatingResources);
        const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newSeatingResource._id}`;
        res.setHeader('Location', location);
        return res.status(201).send(newSeatingResource);
      })
      .catch(err => {
        const message = `Unable to create new seating resource from ${JSON.stringify(seatingResource)}, got error: ${JSON.stringify(err)}`;
        logger.error(message);
        return res.status(400).send(message);
      });
    } catch (error) {
      next(error)
    }
  }

  private patchSeatingResource = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const seatingResourceId = req.params.srid;
      const seatingResource: Omit<SeatingResource, "id"> = {
        name: req.body.name,
        capacity: req.body.capacity,
        shape: req.body.shape,
        sectionId: req.body.sectionId,
        center: { 
          x: req.body.center.x,
          y: req.body.center.y
        },
        shapeDims: { 
          x: req.body.shapeDims.x,
          y: req.body.shapeDims.y
        },
        rotation: req.body.rotation,
        disabled: req.body.disabled
      };
      DataProviderInstance.updateSeatingResource(seatingResourceId, seatingResource)
      .then(async(updatedSeatingResource) => {
        logger.info(`Successfully updated Seating Resource: ${JSON.stringify(updatedSeatingResource)}`);
        await DataProviderInstance.syncSeatingResources();
        await SocketIoProviderInstance.EmitSeatingResources(DataProviderInstance.SeatingResources);
        return res.status(200).send(updatedSeatingResource);
      })
      .catch(err => {
        const message = `Unable to update seating resource with ${JSON.stringify(seatingResource)}, got error: ${JSON.stringify(err)}`;
        logger.error(message);
        return res.status(404).send(message);
      });
    } catch (error) {
      next(error)
    }
  }

  private deleteSeatingResource = async (req: Request, res: Response, next: NextFunction) => {
    logger.error(`Attempting to delete seating resource with ID: ${req.params.srid}. This is dangerous and should only be done if you are sure there are no references to this seating resource in the database.`);
    try {
      const seatingResourceId = req.params.srid;
      DataProviderInstance.deleteSeatingResource(seatingResourceId)
      .then(async (doc) => {
        logger.info(`Successfully deleted Seating Resource ${doc}`);
        await DataProviderInstance.syncSeatingResources();
        await SocketIoProviderInstance.EmitSeatingResources(DataProviderInstance.SeatingResources);
        return res.status(200).send(doc);
      })
      .catch((err) => {
        const errorMessage = `Unable to delete seating resource with ID: ${req.params.srid}, got error: ${JSON.stringify(err)}`;
        logger.error(errorMessage);
        return res.status(400).send(errorMessage);
      })
    } catch (error) {
      next(error)
    }
  }
}