import { Router, Request, Response, NextFunction } from 'express';
import { CURRENCY, DISPLAY_AS, IOptionType, MODIFIER_CLASS } from '@wcp/wario-shared';

import logger from '../logging';
import validationMiddleware from '../middleware/validationMiddleware';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { CatalogProviderInstance, UncommitedOption } from '../config/catalog_provider';
import { ModifierTypeIdParams, ModifierOptionIdParams, ModifierTypeAndOptionIdParams, ModifierTypeDto, ModifierOptionDto } from '../dto/catalog/ModifierDtos';

export class ModifierController implements IExpressController {
  public path = "/api/v1/menu/option";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // this.router.get(`${this.path}/:mtid`, CheckJWT, ScopeReadKVStore, this.getModifierType);
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, validationMiddleware(ModifierTypeDto), this.postModifierType);
    this.router.patch(`${this.path}/:mtid`, CheckJWT, ScopeWriteCatalog, validationMiddleware(ModifierTypeIdParams, { source: 'params' }), validationMiddleware(ModifierTypeDto), this.patchModifierType);
    this.router.delete(`${this.path}/:mtid`, CheckJWT, ScopeDeleteCatalog, validationMiddleware(ModifierTypeIdParams, { source: 'params' }), this.deleteModifierType);
    this.router.post(`${this.path}/:mtid`, CheckJWT, ScopeWriteCatalog, validationMiddleware(ModifierTypeIdParams, { source: 'params' }), validationMiddleware(ModifierOptionDto), this.postModifierOption);
    this.router.patch(`${this.path}/:mtid/:moid`, CheckJWT, ScopeWriteCatalog, validationMiddleware(ModifierTypeAndOptionIdParams, { source: 'params' }), validationMiddleware(ModifierOptionDto), this.patchModifierOption);
    this.router.delete(`${this.path}/:mtid/:moid`, CheckJWT, ScopeDeleteCatalog, validationMiddleware(ModifierTypeAndOptionIdParams, { source: 'params' }), this.deleteModifierOption);
  };

  private postModifierType = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const modifierType: Omit<IOptionType, "id"> = {
        name: req.body.name,
        displayName: req.body.displayName,
        ordinal: req.body.ordinal,
        min_selected: req.body.min_selected,
        max_selected: req.body.max_selected,
        externalIDs: req.body.externalIDs,
        displayFlags: req.body.displayFlags,
      };
      const options: UncommitedOption[] = req.body.options; 
      const doc = await CatalogProviderInstance.CreateModifierType(modifierType, options);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private patchModifierType = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.UpdateModifierType({
        id: request.params.mtid,
        modifierType: {
          name: request.body.name,
          displayName: request.body.displayName,
          ordinal: request.body.ordinal,
          min_selected: request.body.min_selected,
          max_selected: request.body.max_selected,
          externalIDs: request.body.externalIDs,
          displayFlags: request.body.displayFlags,
        }
      });
      if (!doc) {
        logger.info(`Unable to update ModifierType: ${request.params.mtid}`);
        return response.status(404).send(`Unable to update ModifierType: ${request.params.mtid}`);;
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return response.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private deleteModifierType = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeleteModifierType(req.params.mtid);
      if (!doc) {
        logger.info(`Unable to delete Modifier Type: ${req.params.mt_id}`);
        return res.status(404).send(`Unable to delete Modifier Type: ${req.params.mt_id}`);
      }
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }

  private postModifierOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const new_option = await CatalogProviderInstance.CreateOption({
        price: req.body.price,
        description: req.body.description,
        displayName: req.body.displayName,
        shortcode: req.body.shortcode,
        disabled: req.body.disabled ? req.body.disabled : null,
        externalIDs: req.body.externalIDs ?? [],
        modifierTypeId: req.params.mtid,
        ordinal: req.body.ordinal,
        metadata: req.body.metadata,
        enable: req.body.enable,
        displayFlags: req.body.displayFlags,
        availability: req.body.availability
      });
      if (!new_option) {
        logger.info(`Unable to find ModifierType ${req.params.mtid} to create Modifier Option`);
        return res.status(404).send(`Unable to find ModifierType ${req.params.mtid} to create Modifier Option`);
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${new_option.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(new_option);
    } catch (error) {
      return next(error)
    }
  }

  private patchModifierOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const modifierTypeEntry = CatalogProviderInstance.Catalog.modifiers[req.params.mtid];
      if (modifierTypeEntry) {
        const doc = await CatalogProviderInstance.UpdateModifierOption({
          id: req.params.moid,
          modifierTypeId: req.params.mtid,
          modifierOption: {
            displayName: req.body.displayName,
            description: req.body.description,
            price: req.body.price,
            shortcode: req.body.shortcode,
            disabled: req.body.disabled ? req.body.disabled : null,
            externalIDs: req.body.externalIDs ?? [],
            ordinal: req.body.ordinal,
            metadata: req.body.metadata,
            enable: req.body.enable,
            displayFlags: req.body.displayFlags,
            availability: req.body.availability
          }
        });
        if (doc) {
          logger.info(`Successfully updated ${JSON.stringify(doc)}`);
          return res.status(200).send(doc);
        }
      }
      logger.info(`Unable to update ModifierOption: ${req.params.moid}`);
      return res.status(404).send(`Unable to update ModifierOption: ${req.params.moid}`);;
    } catch (error) {
      return next(error)
    }
  }

  private deleteModifierOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeleteModifierOption(req.params.moid);
      if (!doc) {
        logger.info(`Unable to delete Modifier Option: ${req.params.moid}`);
        return res.status(404).send(`Unable to delete Modifier Option: ${req.params.moid}`);
      }
      logger.info(`Successfully deleted ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      return next(error)
    }
  }


}