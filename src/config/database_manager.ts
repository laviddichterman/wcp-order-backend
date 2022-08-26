import logger from '../logging';
import { WProvider } from '../types/WProvider';
import PACKAGE_JSON from '../../package.json';
import { ConstLiteralDiscriminator, IAbstractExpression, IConstLiteralExpression, IHasAnyOfModifierExpression, IIfElseExpression, ILogicalExpression, IModifierPlacementExpression, OptionPlacement, OptionQualifier, ProductInstanceFunctionType, SEMVER, WFunctional } from '@wcp/wcpshared';
import DBVersionModel from '../models/DBVersionSchema';
import { WProductInstanceFunctionModel as WProductInstanceFunctionModelACTUAL } from '../models/query/product/WProductInstanceFunction';
import { WMoney } from '../models/WMoney';
import { IntervalSchema } from '../models/IntervalSchema';
import { WCategoryModel } from '../models/catalog/category/WCategorySchema';
import { WOptionModel as WOptionModelActual } from '../models/catalog/options/WOptionSchema';
import { WOptionTypeModel as WOptionTypeModelActual } from '../models/catalog/options/WOptionTypeSchema';
import { WProductModel as WProductModelActual } from '../models/catalog/products/WProductSchema';
import { WProductInstanceModel as WProductInstanceModelActual } from '../models/catalog/products/WProductInstanceSchema';
import mongoose, { Schema } from "mongoose";

const SetVersion = async (new_version: SEMVER) => {
  return await DBVersionModel.findOneAndUpdate({}, new_version, { new: true, upsert: true });
}

interface IMigrationFunctionObject {
  [index: string]: [SEMVER, () => Promise<void>]
}
const UPGRADE_MIGRATION_FUNCTIONS: IMigrationFunctionObject = {
  "0.2.21": [{ major: 0, minor: 3, patch: 0 }, async () => {
    {
      // re-assign each option_type_id and enable_function in every ModifierOption
      {
        const promises: Promise<any>[] = [];
        const WOptionModel = mongoose.model('woptioNschema', new Schema({ option_type_id: Schema.Types.Mixed, enable_function: Schema.Types.Mixed }));
        const options = await WOptionModel.find();
        options.forEach(
          o => {
            // @ts-ignore
            o.option_type_id = String(o.option_type_id);
            if (o.enable_function) {
              // @ts-ignore
              o.enable_function = String(o.enable_function);
            }
            promises.push(o.save().then(() => {
              logger.debug(`Updated Option ${o.id} with type safe option type id ${o.option_type_id} ${typeof o.option_type_id}.`);
            }).catch((err) => {
              // @ts-ignore
              logger.error(`Unable to update Option ${o.id}. Got error: ${JSON.stringify(err)}`);
            }));
          });
        await Promise.all(promises);
      }
      {
        var promises: Promise<any>[] = [];
        const WProductModel = mongoose.model('wproductsChema', new Schema({
          modifiers: [{ mtid: Schema.Types.Mixed, enable: Schema.Types.Mixed }],
          category_ids: [Schema.Types.Mixed],
        }));
        const elts = await WProductModel.find();
        elts.forEach(
          o => {
            //@ts-ignore
            o.modifiers = o.modifiers.map(mod => ({ mtid: String(mod.mtid), enable: mod.enable ? String(mod.enable) : null }));
            //@ts-ignore
            o.category_ids = o.category_ids.map(c => String(c));
            promises.push(o.save({}).then(() => {
              logger.debug(`Updated WProductModel ${o.id} with type safe modifers ${o.modifiers}, categoryIds: ${o.category_ids}.`);
            }).catch((err) => {
              logger.error(`Unable to update WProductModel ${o.id}. Got error: ${JSON.stringify(err)}`);
            }));
          });
        await Promise.all(promises);
      }
      {
        var promises: Promise<any>[] = [];
        const WProductInstanceModel = mongoose.model('wproductinstanceSchema', new Schema({ product_id: Schema.Types.Mixed }));
        const elts = await WProductInstanceModel.find();
        elts.forEach(
          o => {
            //@ts-ignore
            o.product_id = String(o.product_id)
            promises.push(o.save({}).then(() => {
              logger.debug(`Updated WProductInstanceModel ${o.id} with type safe product ID ${o.product_id}.`);
            }).catch((err) => {
              logger.error(`Unable to update WProductInstanceModel ${o.id}. Got error: ${JSON.stringify(err)}`);
            }));
          });
        await Promise.all(promises);
      }
      {
        var promises: Promise<any>[] = [];
        const WCategoryModel = mongoose.model('wcategoryschema', new Schema({ parent_id: Schema.Types.Mixed }));
        const cats = await WCategoryModel.find();
        cats.forEach(
          c => {
            if (c.parent_id === undefined || c.parent_id === null || String(c.parent_id) === "") {
              c.parent_id = null;
            }
            else {
              //@ts-ignore
              c.parent_id = String(c.parent_id)
            }
            promises.push(c.save({}).then(() => {
              logger.debug(`Updated WCategorySchema ${c.id} with type safe parent ID ${c.parent_id}.`);
            }).catch((err) => {
              logger.error(`Unable to update WCategorySchema ${c.id}. Got error: ${JSON.stringify(err)}`);
            }));
          });
        await Promise.all(promises);
      }
      {
        interface IAbstractExpressionOld {
          const_literal?: IConstLiteralExpression;
          if_else?: IIfElseExpression<IAbstractExpression>;
          logical?: ILogicalExpression<IAbstractExpression>;
          modifier_placement?: IModifierPlacementExpression;
          has_any_of_modifier?: IHasAnyOfModifierExpression;
          discriminator: keyof typeof ProductInstanceFunctionType;
        };

        var promises: Promise<any>[] = [];
        const WProductInstanceFunctionModel = mongoose.model('WProductinStancefunction', new Schema({
          name: { type: String, required: true },
          expression: {
            required: true,
            type: {
              expr: Schema.Types.Mixed,
              discriminator: { type: String, enum: ProductInstanceFunctionType, required: true },
              const_literal: Schema.Types.Mixed,
              if_else: Schema.Types.Mixed,
              logical: Schema.Types.Mixed,
              modifier_placement: Schema.Types.Mixed,
              has_any_of_modifier: Schema.Types.Mixed
            }
          }
        }));
        const res = await WProductInstanceFunctionModel.find();
        const convertRecursive = function (e: IAbstractExpressionOld): IAbstractExpression {
          switch (e.discriminator) {
            case ProductInstanceFunctionType.ConstLiteral:
              return { discriminator: ProductInstanceFunctionType.ConstLiteral, expr: e.const_literal };
            case ProductInstanceFunctionType.HasAnyOfModifierType:
              return { discriminator: ProductInstanceFunctionType.HasAnyOfModifierType, expr: e.has_any_of_modifier }
            case ProductInstanceFunctionType.IfElse:
              return {
                discriminator: ProductInstanceFunctionType.IfElse,
                expr: {
                  test: convertRecursive(e.if_else.test),
                  true_branch: convertRecursive(e.if_else.true_branch),
                  false_branch: convertRecursive(e.if_else.false_branch)
                }
              };
            case ProductInstanceFunctionType.Logical:
              return {
                discriminator: ProductInstanceFunctionType.Logical,
                expr: {
                  operandA: convertRecursive(e.logical.operandA),
                  operandB: e.logical.operandB ? convertRecursive(e.logical.operandB) : undefined,
                  operator: e.logical.operator
                }
              };
            case ProductInstanceFunctionType.ModifierPlacement:
              return {
                discriminator: ProductInstanceFunctionType.ModifierPlacement,
                expr: e.modifier_placement
              };
          }
        }
        res.forEach(
          e => {
            // @ts-ignore
            e.expression = convertRecursive(e.expression);
            promises.push(e.save({}).then(() => {
              logger.debug(`Updated WProductInstanceFunction ${e.id} with discriminator based typed expression: ${JSON.stringify(e.expression)}`);
            }).catch((err) => {
              logger.error(`Unable to update WProductInstanceFunction ${e.id}. Got error: ${JSON.stringify(err)}`);
            }));
          }
        );
        await Promise.all(promises);
      }
    }
  }],
  "0.3.0": [{ major: 0, minor: 3, patch: 1 }, async () => {
  }],
  "0.3.1": [{ major: 0, minor: 3, patch: 2 }, async () => {
  }],
  "0.3.2": [{ major: 0, minor: 3, patch: 3 }, async () => {
  }],
  "0.3.3": [{ major: 0, minor: 3, patch: 4 }, async () => {
  }],
  "0.3.4": [{ major: 0, minor: 3, patch: 5 }, async () => {
  }],
  "0.3.5": [{ major: 0, minor: 3, patch: 6 }, async () => {
    // convert all ConstLiteralExpressions to the discriminator versions
    {
      var promises: Promise<any>[] = [];
      const WProductInstanceFunctionModel = mongoose.model('wproductinstancefunction', new Schema({
        name: { type: String, required: true },
        expression: {
          required: true,
          type: {
            expr: { type: Schema.Types.Mixed, required: true },
            discriminator: { type: String, enum: ProductInstanceFunctionType, required: true },
          }
        }
      }));
      const res = await WProductInstanceFunctionModel.find();
      const convertRecursive = function (e: IAbstractExpression): IAbstractExpression {
        switch (e.discriminator) {
          case ProductInstanceFunctionType.ConstLiteral:
            // @ts-ignore
            return { discriminator: ProductInstanceFunctionType.ConstLiteral, expr: { discriminator: ConstLiteralDiscriminator.NUMBER, value: e.expr.value } };
          case ProductInstanceFunctionType.HasAnyOfModifierType:
            return { discriminator: ProductInstanceFunctionType.HasAnyOfModifierType, expr: { mtid: e.expr.mtid } };
          case ProductInstanceFunctionType.IfElse:
            return {
              discriminator: ProductInstanceFunctionType.IfElse,
              expr: {
                test: convertRecursive(e.expr.test),
                true_branch: convertRecursive(e.expr.true_branch),
                false_branch: convertRecursive(e.expr.false_branch)
              }
            };
          case ProductInstanceFunctionType.Logical:
            return {
              discriminator: ProductInstanceFunctionType.Logical,
              expr: {
                operandA: convertRecursive(e.expr.operandA),
                operandB: e.expr.operandB ? convertRecursive(e.expr.operandB) : undefined,
                operator: e.expr.operator
              }
            };
          case ProductInstanceFunctionType.ModifierPlacement:
            return { discriminator: ProductInstanceFunctionType.ModifierPlacement, expr: { mtid: e.expr.mtid, moid: e.expr.moid } };
        }
      }
      res.forEach(
        e => {
          // @ts-ignore
          const convertedExpression = convertRecursive(e.expression);
          //const goosed = ExpressionToMongooseModel(convertedExpression);
          //logger.debug(`Converted expression string: ${JSON.stringify(goosed)}`);
          promises.push(WProductInstanceFunctionModelACTUAL.findByIdAndUpdate(
            e.id,
            {
              name: e.name,
              expression: convertedExpression
            },
            { new: true }
          ).then((updated: any) => {
            logger.debug(`Updated WProductInstanceFunction ${e.id} with discriminator based ConstLiteral expression: ${JSON.stringify(updated)}`);
          }).catch((err: any) => {
            logger.error(`Unable to update WProductInstanceFunction ${e.id}. Got error: ${JSON.stringify(err)}`);
          }));
        }
      );
      await Promise.all(promises);
    }
    {
      // assign empty service_disable to all ProductModifierSchema in WProductSchema
      // assign empty warnings and suggestions function lists to order_guide in WProductSchema
      var promises: Promise<any>[] = [];
      const WProductModel = mongoose.model('wproductschema', new Schema({
        modifiers: [{ mtid: String, enable: String, service_disable: Schema.Types.Mixed }],
        display_flags: {
          flavor_max: Number,
          bake_max: Number,
          bake_differential: Number,
          show_name_of_base_product: Boolean,
          singular_noun: String,
          order_guide: {
            warnings: Schema.Types.Mixed,
            suggestions: Schema.Types.Mixed
          }
        },
      }));
      const elts = await WProductModel.find();
      elts.forEach(
        o => {
          //@ts-ignore
          o.modifiers = o.modifiers.map(mod => ({ mtid: mod.mtid, enable: mod.enable ? String(mod.enable) : null, service_disable: [] }));
          //@ts-ignore
          o.display_flags.order_guide = { warnings: [], suggestions: [] };
          promises.push(o.save({}).then(() => {
            logger.debug(`Updated WProductModel ${o.id} with empty service_disable modifiers ${JSON.stringify(o.modifiers)} and empty order guide, categoryIds: ${JSON.stringify(o.display_flags.order_guide)}.`);
          }).catch((err) => {
            logger.error(`Unable to update WProductModel ${o.id}. Got error: ${JSON.stringify(err)}`);
          }));
        });
      await Promise.all(promises);
    }
  }],
  "0.3.6": [{ major: 0, minor: 3, patch: 7 }, async () => {
  }],
  "0.3.7": [{ major: 0, minor: 3, patch: 8 }, async () => {
  }],
  "0.3.8": [{ major: 0, minor: 3, patch: 9 }, async () => {
  }],
  "0.3.9": [{ major: 0, minor: 3, patch: 10 }, async () => {
    {
      // add props to Category
      const category_update = await WCategoryModel.updateMany(
        {},
        {
          $set: {
            "display_flags.nesting": "TAB",
            'serviceDisable': []
          }
        });
      if (category_update.modifiedCount > 0) {
        logger.debug(`Updated ${category_update.modifiedCount} Categories with nesting and serviceDisable props.`);
      }
      else {
        logger.warn("No categories had nesting or serviceDisable added");
      }
    }
  }],
  "0.3.10": [{ major: 0, minor: 4, patch: 0 }, async () => {
  }],
  "0.4.0": [{ major: 0, minor: 4, patch: 90 }, async () => {
    {
      // IProduct remove item and set externalIDs = {}
      // remove ProductModifierSchema.service_disable and log warning
      // move to camelCase: displayFlags, serviceDisable
      const WProductModel = mongoose.model('wproductsCHema', new Schema({
        modifiers: [{ mtid: String, enable: String, service_disable: Schema.Types.Mixed, serviceDisable: [String] }],
        item: Schema.Types.Mixed,
        externalIDs: Schema.Types.Mixed,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
        serviceDisable: [String],
        service_disable: [Number]
      }));
      const elts = await WProductModel.find();
      await Promise.all(elts.map(async (prod) => {
        prod.displayFlags = prod.display_flags;
        prod.display_flags = undefined;
        prod.externalIDs = {};
        prod.item = undefined;
        if (prod.service_disable.length > 0) {
          logger.warn(`About to remove product set service disable of ${JSON.stringify(prod.service_disable)} for ProductID: ${prod.id}`);
        }
        prod.service_disable = undefined;
        prod.serviceDisable = [];
        prod.modifiers = prod.modifiers.map(mod => {
          if (mod.service_disable.length > 0) {
            logger.warn(`About to remove modifier set service disable of ${JSON.stringify(mod.service_disable)} for ProductID: ${prod.id}`);
          }
          return { mtid: mod.mtid, enable: mod.enable, serviceDisable: [] };
        });
        return await prod.save()
          .then(doc => {
            logger.info(`Updated ProductModel with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ProductModel ${prod.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          })
      }));
    }
    {
      // IProductInstance externalIDs set to {}, move description, displayName, shortcode, delete item, convert modifiers list to new modifiers list
      // remove ProductModifierSchema.service_disable and log warning
      const WProductInstanceModel = mongoose.model('WProductINStanceSchema', new Schema({
        modifiers: Schema.Types.Mixed,
        item: Schema.Types.Mixed,
        displayName: String,
        description: String,
        shortcode: String,
        externalIDs: Schema.Types.Mixed,
        is_base: Boolean,
        isBase: Boolean,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
        product_id: String,
        productId: String
      }));
      const elts = await WProductInstanceModel.find();
      await Promise.all(elts.map(async (pi) => {
        pi.shortcode = pi.item.shortcode;
        pi.description = pi.item.description;
        pi.displayName = pi.item.display_name;
        pi.externalIDs = {};
        pi.item = undefined;
        pi.displayFlags = pi.display_flags;
        pi.display_flags = undefined;
        pi.isBase = pi.is_base;
        pi.is_base = undefined;
        pi.productId = pi.product_id;
        pi.product_id = undefined;
        pi.modifiers = pi.modifiers.map((mod: {
          modifier_type_id: string;
          options: {
            option_id: string;
            placement: keyof typeof OptionPlacement;
            qualifier: keyof typeof OptionQualifier;
          }[];
        }) => ({
          modifierTypeId: mod.modifier_type_id, options: mod.options.map(
            x => ({ optionId: x.option_id, placement: OptionPlacement[x.placement], qualifier: OptionQualifier[x.qualifier] }))
        }));
        return await pi.save()
          .then(doc => {
            logger.info(`Updated ProductInstance with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ProductInstance ${pi.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          })
      }));
    }
    {
      // IOption moves all item fields to base (displayName, description, shortcode, price, disabled), set externalIDs = {}
      // camelCase: displayName, enable, displayFlags, modifierTypeId
      const WOptionModel = mongoose.model('woPtioNschema', new Schema({
        item: Schema.Types.Mixed,
        displayName: String,
        description: String,
        shortcode: String,
        option_type_id: String,
        modifierTypeId: String,
        disabled: IntervalSchema,
        price: WMoney,
        externalIDs: Schema.Types.Mixed,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
        enable_function: Schema.Types.Mixed,
        enable: Schema.Types.Mixed
      }));
      const elts = await WOptionModel.find();
      await Promise.all(elts.map(async (opt) => {
        opt.shortcode = opt.item.shortcode;
        opt.description = opt.item.description;
        opt.displayName = opt.item.display_name;
        opt.price = opt.item.price;
        opt.disabled = opt.item.disabled ? opt.item.disabled : null;
        opt.externalIDs = {};
        opt.item = undefined;
        opt.displayFlags = opt.display_flags;
        opt.display_flags = undefined;
        opt.modifierTypeId = opt.option_type_id;
        opt.option_type_id = undefined;
        opt.enable = opt.enable_function ?? null;
        opt.enable_function = undefined;
        return await opt.save()
          .then(doc => {
            logger.info(`Updated ModifierOption with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ModifierOption ${opt.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          });
      }));
    }
    {
      // IOptionType externalIDs = {}
      // camelCase: displayName, displayFlags
      const WOptionTypeModel = mongoose.model('WOpTIOntypeSchema', new Schema({
        display_name: String,
        displayName: String,
        externalIDs: Schema.Types.Mixed,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
      }));
      const elts = await WOptionTypeModel.find();
      await Promise.all(elts.map(async (opt) => {
        opt.displayName = opt.display_name;
        opt.display_name = undefined;
        opt.externalIDs = {};
        opt.displayFlags = opt.display_flags;
        opt.display_flags = undefined;
        return await opt.save()
          .then(doc => {
            logger.info(`Updated ModifierOptionType with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ModifierOptionType ${opt.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          });
      }));
    }
  }],
  "0.4.90": [{ major: 0, minor: 4, patch: 91 }, async () => {
  }],
  "0.4.91": [{ major: 0, minor: 4, patch: 92 }, async () => {
  }],
  "0.4.92": [{ major: 0, minor: 4, patch: 93 }, async () => {
  }],
  "0.4.93": [{ major: 0, minor: 4, patch: 94 }, async () => {
  }],
  "0.4.94": [{ major: 0, minor: 4, patch: 95 }, async () => {

    const SettingsModel = mongoose.model('SeTTingsSchema', new Schema({
      pipeline_info: Schema.Types.Mixed,
      operating_hours: Schema.Types.Mixed,
      time_step: Schema.Types.Mixed,
      time_step2: Schema.Types.Mixed,
    }));
    const s_update = await SettingsModel.updateMany(
      {},
      {
        $unset: {
          "pipeline_info": "",
          "operating_hours": "",
          "time_step": "",
          "time_step2": "",
        }
      });
    if (s_update.modifiedCount > 0) {
      logger.debug(`Updated ${s_update.modifiedCount} SettingsModel documents to remove old settings fields.`);
    }
    else {
      logger.error("Didn't update SettingsModel");
    }
  }],
  "0.4.95": [{ major: 0, minor: 4, patch: 96 }, async () => {
  }],
  "0.4.96": [{ major: 0, minor: 4, patch: 97 }, async () => {
  }],
  "0.4.97": [{ major: 0, minor: 4, patch: 98 }, async () => {
  }],
  "0.4.98": [{ major: 0, minor: 4, patch: 99 }, async () => {
  }],
  "0.4.99": [{ major: 0, minor: 4, patch: 100 }, async () => {
  }],
  "0.4.100": [{ major: 0, minor: 4, patch: 101 }, async () => {
    {
      // add props to Category
      const category_update = await WCategoryModel.updateMany(
        {},
        {
          $set: {
            'serviceDisable': []
          }
        });
      if (category_update.modifiedCount > 0) {
        logger.debug(`Updated ${category_update.modifiedCount} Categories with empty serviceDisable props.`);
      }
      else {
        logger.warn("No categories had serviceDisable blanked added");
      }
    }
  }],
  "0.4.101": [{ major: 0, minor: 4, patch: 102 }, async () => {
  }],
  "0.4.102": [{ major: 0, minor: 4, patch: 103 }, async () => {
  }],
  "0.4.103": [{ major: 0, minor: 4, patch: 104 }, async () => {
  }],
  "0.4.104": [{ major: 0, minor: 4, patch: 105 }, async () => {
  }],
  "0.4.105": [{ major: 0, minor: 4, patch: 106 }, async () => {
  }],
  "0.4.106": [{ major: 0, minor: 5, patch: 0 }, async () => {
  }],
  "0.5.0": [{ major: 0, minor: 5, patch: 1 }, async () => {
    await Promise.all([WOptionModelActual, WOptionTypeModelActual, WProductInstanceModelActual, WProductModelActual].map( async (model) => {
      const updateQuery = await model.updateMany(
        {},
        {
          externalIDs: []
        });
      if (updateQuery.modifiedCount > 0) {
        logger.debug(`Updated ${updateQuery.modifiedCount} ${model.modelName} documents with empty externalIDs list.`);
      }
      else {
        logger.error("Didn't update WOptionModel");
      }
    }));
  }],
}

export class DatabaseManager implements WProvider {
  constructor() {
  }

  Bootstrap = async () => {
    const [VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH] = PACKAGE_JSON.version.split(".", 3).map(x => parseInt(x));
    const VERSION_PACKAGE = { major: VERSION_MAJOR, minor: VERSION_MINOR, patch: VERSION_PATCH };

    // load version from the DB
    logger.info("Running database upgrade bootstrap.");

    var current_db_version = "0.0.0";

    const db_version = await DBVersionModel.find({});
    if (db_version.length > 1) {
      logger.error(`Found more than one DB version entry: ${JSON.stringify(db_version)}, deleting all.`);
      await DBVersionModel.deleteMany({});
    }
    else if (db_version.length === 1) {
      current_db_version = `${db_version[0].major}.${db_version[0].minor}.${db_version[0].patch}`;
    }

    // run update loop
    while (PACKAGE_JSON.version !== current_db_version) {
      if (Object.hasOwn(UPGRADE_MIGRATION_FUNCTIONS, current_db_version)) {
        const [next_ver, migration_function] = UPGRADE_MIGRATION_FUNCTIONS[current_db_version];
        const next_ver_string = `${next_ver.major}.${next_ver.minor}.${next_ver.patch}`;
        logger.info(`Running migration function from ${current_db_version} to ${next_ver_string}`);
        await migration_function();
        await SetVersion(next_ver);
        current_db_version = next_ver_string;
      }
      else {
        logger.warn(`No explicit migration from ${current_db_version} to ${PACKAGE_JSON.version}, setting to new version.`);
        await SetVersion(VERSION_PACKAGE);
        current_db_version = PACKAGE_JSON.version;
      }
    }
    logger.info("Database upgrade checks completed.");
  };


}

export const DatabaseManagerInstance = new DatabaseManager();
