import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { CURRENCY, DISPLAY_AS, MODIFIER_CLASS } from '@wcp/wcpshared';

import logger from '../logging';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import IExpressController from '../types/IExpressController';
import { isValidDisabledValue } from '../types/Validations';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import CatalogProviderInstance from '../config/catalog_provider';
const ModifierTypeByIdValidationChain = [
  param('mtid').trim().escape().exists().isMongoId(), 
];

const ModifierOptionByIdValidationChain = [
  param('moid').trim().escape().exists().isMongoId(), 
];

const ModifierTypeValidationChain = [  
  body('name').trim().exists(),
  body('displayName').trim(),
  body('ordinal').isInt({min: 0, max:63}).exists(),
  body('min_selected').isInt({min: 0}).exists(),
  body('max_selected').optional({nullable: true}).isInt({min: 0}),
  body('externalIDs.*').trim().escape(),
  body('displayFlags.omit_section_if_no_available_options').toBoolean(true),
  body('displayFlags.omit_options_if_not_available').toBoolean(true),
  body('displayFlags.use_toggle_if_only_two_options').toBoolean(true),
  body('displayFlags.hidden').toBoolean(true),
  body('displayFlags.modifier_class').exists().isIn(Object.keys(MODIFIER_CLASS)),
  body('displayFlags.empty_display_as').exists().isIn(Object.keys(DISPLAY_AS)),
  body('displayFlags.template_string').exists().matches(/^[A-Za-z0-9]*$/),
  body('displayFlags.multiple_item_separator').exists(),
  body('displayFlags.non_empty_group_prefix').exists(),
  body('displayFlags.non_empty_group_suffix').exists()
];

const EditModifierTypeValidationChain = [
  ...ModifierTypeByIdValidationChain,
  ...ModifierTypeValidationChain
];
const ModifierOptionValidationChain = [  
  ...ModifierTypeByIdValidationChain,
  body('displayName').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').custom(isValidDisabledValue),
  body('price.amount').isInt({min: 0, max:100000}).exists(),
  body('price.currency').exists().isLength({min:3, max: 3}).isIn(Object.values(CURRENCY)),
  body('ordinal').isInt({min: 0, max:64}).exists(),
  body('enable').optional({nullable: true}).isMongoId(),
  body('metadata.flavor_factor').isFloat({ min: 0, max: 5 }),
  body('metadata.bake_factor').isFloat({ min: 0, max: 5 }),
  body('metadata.can_split').toBoolean(true),
  body('displayFlags.omit_from_shortname').toBoolean(true),
  body('displayFlags.omit_from_name').toBoolean(true),
];
const EditModifierOptionValidationChain = [  
  ...ModifierTypeByIdValidationChain,
  ...ModifierOptionValidationChain
];


export class ModifierController implements IExpressController {
  public path = "/api/v1/menu/option";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // this.router.get(`${this.path}/:mtid`, CheckJWT, ScopeReadKVStore, this.getModifierType);
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(ModifierTypeValidationChain), this.postModifierType);
    this.router.patch(`${this.path}/:mtid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditModifierTypeValidationChain), this.patchModifierType);
    this.router.delete(`${this.path}/:mtid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(ModifierTypeByIdValidationChain), this.deleteModifierType);
    this.router.post(`${this.path}/:mtid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(ModifierOptionValidationChain), this.postModifierOption);
    this.router.patch(`${this.path}/:mtid/:moid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditModifierOptionValidationChain), this.patchModifierOption);
    this.router.delete(`${this.path}/:mtid/:moid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware([...ModifierTypeByIdValidationChain, ...ModifierOptionByIdValidationChain]), this.deleteModifierOption);
  };
  private postModifierType = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.CreateModifierType({
        name: req.body.name,
        displayName: req.body.displayName,
        ordinal: req.body.ordinal,
        min_selected: req.body.min_selected,
        max_selected: req.body.max_selected,
        externalIDs: req.body.externalIDs,
        displayFlags: req.body.displayFlags,
      });
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private patchModifierType = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.UpdateModifierType(
        request.params.mtid,
        {
          name: request.body.name,
          displayName: request.body.displayName,
          ordinal: request.body.ordinal,
          min_selected: request.body.min_selected,
          max_selected: request.body.max_selected,
          externalIDs: request.body.externalIDs,
          displayFlags: request.body.displayFlags,
        }
      );
      if (!doc) {
        logger.info(`Unable to update ModifierType: ${request.params.mtid}`);
        return response.status(404).send(`Unable to update ModifierType: ${request.params.mtid}`);;
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return response.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deleteModifierType = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeleteModifierType(req.params.mtid);
      if (!doc) {
        logger.info(`Unable to delete Modifier Type: ${req.params.mt_id}`);
        return res.status(404).send(`Unable to delete Modifier Type: ${req.params.mt_id}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
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
        externalIDs: req.body.externalIDs,
        modifierTypeId: req.params.mtid,
        ordinal: req.body.ordinal,
        metadata: req.body.metadata,
        enable: req.body.enable,
        displayFlags: req.body.displayFlags,
      });
      if (!new_option) {
        logger.info(`Unable to find ModifierType ${req.params.mtid} to create Modifier Option`);
        return res.status(404).send(`Unable to find ModifierType ${req.params.mtid} to create Modifier Option`);
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${new_option.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(new_option);
    } catch (error) {
      next(error)
    }
  }

  private patchModifierOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.UpdateModifierOption(req.params.moid, {
        displayName: req.body.displayName, 
        description: req.body.description, 
        price: req.body.price, 
        shortcode: req.body.shortcode, 
        disabled: req.body.disabled ? req.body.disabled : null, 
        externalIDs: req.body.externalIDs,
        ordinal: req.body.ordinal, 
        metadata: req.body.metadata,
        enable: req.body.enable,
        displayFlags: req.body.displayFlags,
      });
      if (!doc) {
        logger.info(`Unable to update ModifierOption: ${req.params.moid}`);
        return res.status(404).send(`Unable to update ModifierOption: ${req.params.moid}`);;
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }

  private deleteModifierOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await CatalogProviderInstance.DeleteModifierOption(req.params.moid);
      if (!doc) {
        logger.info(`Unable to delete Modifier Option: ${req.params.moid}`);
        return res.status(404).send(`Unable to delete Modifier Option: ${req.params.moid}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  }


}