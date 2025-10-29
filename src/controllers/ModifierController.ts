import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { CURRENCY, DISPLAY_AS, IOptionType, MODIFIER_CLASS } from '@wcp/wario-shared';

import logger from '../logging';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import IExpressController from '../types/IExpressController';
import { isValidDisabledValue } from '../types/Validations';
import { CheckJWT, ScopeDeleteCatalog, ScopeWriteCatalog } from '../config/authorization';
import { CatalogProviderInstance, UncommitedOption } from '../config/catalog_provider';

const ModifierTypeByIdValidationChain = [
  param('mtid').trim().escape().exists().isMongoId(),
];

const ModifierOptionByIdValidationChain = [
  param('moid').trim().escape().exists().isMongoId(),
];

const ModifierTypeValidationChain = [
  body('name').trim().exists().isLength({ min: 1 }),
  body('displayName').trim(),
  body('ordinal').isInt({ min: 0, max: 500 }).exists(),
  body('min_selected').isInt({ min: 0 }).exists(),
  body('max_selected').optional({ nullable: true }).isInt({ min: 0 }),
  body('externalIDs').isArray(),
  body('externalIDs.*.key').exists().isLength({ min: 1 }),
  body('externalIDs.*.value').exists(),
  body('displayFlags.is3p').exists().toBoolean(true),
  body('displayFlags.omit_section_if_no_available_options').exists().toBoolean(true),
  body('displayFlags.omit_options_if_not_available').exists().toBoolean(true),
  body('displayFlags.use_toggle_if_only_two_options').exists().toBoolean(true),
  body('displayFlags.hidden').exists().toBoolean(true),
  body('displayFlags.modifier_class').exists().isIn(Object.keys(MODIFIER_CLASS)),
  body('displayFlags.empty_display_as').exists().isIn(Object.keys(DISPLAY_AS)),
  body('displayFlags.template_string').exists().matches(/^[A-Za-z0-9]*$/),
  body('displayFlags.multiple_item_separator').exists(),
  body('displayFlags.non_empty_group_prefix').exists(),
  body('displayFlags.non_empty_group_suffix').exists()
];

const ModifierOptionValidationChain = (prefix: string) => [
  body(`${prefix}displayName`).trim().exists(),
  body(`${prefix}description`).trim(),
  body(`${prefix}shortcode`).trim().escape().exists(),
  body(`${prefix}externalIDs`).isArray(),
  body(`${prefix}externalIDs.*.key`).exists(),
  body(`${prefix}externalIDs.*.value`).exists(),
  body(`${prefix}disabled`).custom(isValidDisabledValue),
  body(`${prefix}price.amount`).isInt({ min: 0 }).exists(),
  body(`${prefix}price.currency`).exists().isIn(Object.values(CURRENCY)),
  body(`${prefix}ordinal`).isInt({ min: 0 }).exists(),
  body(`${prefix}enable`).optional({ nullable: true }).isMongoId(),
  body(`${prefix}metadata.flavor_factor`).isFloat({ min: 0 }),
  body(`${prefix}metadata.bake_factor`).isFloat({ min: 0 }),
  body(`${prefix}metadata.can_split`).toBoolean(true),
  body(`${prefix}metadata.allowHeavy`).toBoolean(true),
  body(`${prefix}metadata.allowLite`).toBoolean(true),
  body(`${prefix}metadata.allowOTS`).toBoolean(true),
  body(`${prefix}displayFlags.omit_from_shortname`).toBoolean(true),
  body(`${prefix}displayFlags.omit_from_name`).toBoolean(true),
  body(`${prefix}availbility`).optional({ nullable: true }).isArray(),
  body(`${prefix}availbility.*`).isObject()
];

const AddModifierTypeValidationChain = [
  ...ModifierTypeValidationChain,
  body('options').isArray(),
  ...ModifierOptionValidationChain('options.*.')
]

const EditModifierTypeValidationChain = [
  ...ModifierTypeByIdValidationChain,
  ...ModifierTypeValidationChain
];

const AddModifierOptionValidationChain = [
  ...ModifierTypeByIdValidationChain,
  ...ModifierOptionValidationChain('')
]
const EditModifierOptionValidationChain = [
  ...ModifierTypeByIdValidationChain,
  ...ModifierOptionByIdValidationChain,
  ...ModifierOptionValidationChain('')
];


export class ModifierController implements IExpressController {
  public path = "/api/v1/menu/option";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // this.router.get(`${this.path}/:mtid`, CheckJWT, ScopeReadKVStore, this.getModifierType);
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(AddModifierTypeValidationChain), this.postModifierType);
    this.router.patch(`${this.path}/:mtid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditModifierTypeValidationChain), this.patchModifierType);
    this.router.delete(`${this.path}/:mtid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware(ModifierTypeByIdValidationChain), this.deleteModifierType);
    this.router.post(`${this.path}/:mtid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(AddModifierOptionValidationChain), this.postModifierOption);
    this.router.patch(`${this.path}/:mtid/:moid`, CheckJWT, ScopeWriteCatalog, expressValidationMiddleware(EditModifierOptionValidationChain), this.patchModifierOption);
    this.router.delete(`${this.path}/:mtid/:moid`, CheckJWT, ScopeDeleteCatalog, expressValidationMiddleware([...ModifierTypeByIdValidationChain, ...ModifierOptionByIdValidationChain]), this.deleteModifierOption);
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