import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { DISPLAY_AS, MODIFIER_CLASS } from '@wcp/wcpshared';

import logger from '../logging';

import IExpressController from '../types/IExpressController';
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
  body('display_name').trim(),
  body('ordinal').isInt({min: 0, max:63}).exists(),
  body('min_selected').isInt({min: 0}).exists(),
  body('max_selected').optional({nullable: true}).isInt({min: 0}),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('display_flags.omit_section_if_no_available_options').toBoolean(true),
  body('display_flags.omit_options_if_not_available').toBoolean(true),
  body('display_flags.use_toggle_if_only_two_options').toBoolean(true),
  body('display_flags.hidden').toBoolean(true),
  body('display_flags.modifier_class').exists().isIn(Object.keys(MODIFIER_CLASS)),
  body('display_flags.empty_display_as').exists().isIn(Object.keys(DISPLAY_AS)),
  body('display_flags.template_string').exists().matches(/^[A-Za-z0-9]*$/),
  body('display_flags.multiple_item_separator').exists(),
  body('display_flags.non_empty_group_prefix').exists(),
  body('display_flags.non_empty_group_suffix').exists()
];

const EditModifierTypeValidationChain = [
  ...ModifierTypeByIdValidationChain,
  ...ModifierTypeValidationChain
];
const ModifierOptionValidationChain = [  
  ...ModifierTypeByIdValidationChain,
  body('display_name').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').custom((value) => {
    if (!value || (typeof value === 'object' && "start" in value && "end" in value && Number.isInteger(value.start) && Number.isInteger(value.end))) {
      return true;
    }
    throw new Error("Disabled value misformed");
  }),
  body('price.amount').isInt({min: 0, max:100000}).exists(),
  body('price.currency').exists().isLength({min:3, max: 3}).isIn(['USD']),
  body('ordinal').isInt({min: 0, max:64}).exists(),
  body('enable_function').optional({nullable: true}).isMongoId(),
  body('flavor_factor').isFloat({ min: 0, max: 5 }),
  body('bake_factor').isFloat({ min: 0, max: 5 }),
  body('can_split').toBoolean(true),
  body('display_flags.omit_from_shortname').toBoolean(true),
  body('display_flags.omit_from_name').toBoolean(true),
];
const EditModifierOptionValidationChain = [  
  ...ModifierTypeByIdValidationChain,
  ...ModifierOptionValidationChain
];


export class ModifierController implements IExpressController {
  public path = "/api/v1/menu/option/";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // this.router.get(`${this.path}/:mtid`, CheckJWT, ScopeReadKVStore, this.getModifierType);
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, ModifierTypeValidationChain, this.postModifierType);
    this.router.patch(`${this.path}/:mtid`, CheckJWT, ScopeWriteCatalog, EditModifierTypeValidationChain, this.patchModifierType);
    this.router.delete(`${this.path}/:mtid`, CheckJWT, ScopeDeleteCatalog, ModifierTypeByIdValidationChain, this.deleteModifierType);
    this.router.post(`${this.path}:mtid/`, CheckJWT, ScopeWriteCatalog, ModifierOptionValidationChain, this.postModifierOption);
    this.router.patch(`${this.path}/:mtid/:moid`, CheckJWT, ScopeWriteCatalog, EditModifierOptionValidationChain, this.patchModifierOption);
    this.router.delete(`${this.path}/:mtid/:moid`, CheckJWT, ScopeDeleteCatalog, ModifierTypeByIdValidationChain, ModifierOptionByIdValidationChain, this.deleteModifierOption);
  };
  private postModifierType = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.CreateModifierType({
        name: req.body.name,
        display_name: req.body.display_name,
        ordinal: req.body.ordinal,
        min_selected: req.body.min_selected,
        max_selected: req.body.max_selected,
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        display_flags: req.body.display_flags,
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
      const errors = validationResult(request);
      if (!errors.isEmpty()) {
        return response.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.UpdateModifierType(
        request.params.mtid,
        {
          name: request.body.name,
          display_name: request.body.display_name,
          ordinal: request.body.ordinal,
          min_selected: request.body.min_selected,
          max_selected: request.body.max_selected,
          externalIDs: {
            revelID: request.body.revelID,
            squareID: request.body.squareID
          },
          display_flags: request.body.display_flags,
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const new_option = await CatalogProviderInstance.CreateOption({
        price: req.body.price,
        description: req.body.description,
        display_name: req.body.display_name,
        shortcode: req.body.shortcode,
        disabled: req.body.disabled ? req.body.disabled : null, 
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        option_type_id: req.params.mtid,
        ordinal: req.body.ordinal,
        metadata: {
          flavor_factor: req.body.flavor_factor || 0,
          bake_factor: req.body.bake_factor || 0,
          can_split: req.body.can_split || false,
        },
        enable_function: req.body.enable_function,
        display_flags: req.body.display_flags,
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.UpdateModifierOption(req.params.moid, {
        display_name: req.body.display_name, 
        description: req.body.description, 
        price: req.body.price, 
        shortcode: req.body.shortcode, 
        disabled: req.body.disabled ? req.body.disabled : null, 
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        ordinal: req.body.ordinal, 
        metadata: {
          flavor_factor: req.body.flavor_factor, 
          bake_factor: req.body.bake_factor, 
          can_split: req.body.can_split, 
        },
        enable_function: req.body.enable_function,
        display_flags: req.body.display_flags,
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
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