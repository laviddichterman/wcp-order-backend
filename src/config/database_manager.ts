import logger from '../logging';
import { WProvider } from '../types/WProvider';
import PACKAGE_JSON from '../../package.json';
import { ConstLiteralDiscriminator, IAbstractExpression, IConstLiteralExpression, IHasAnyOfModifierExpression, IIfElseExpression, ILogicalExpression, IModifierPlacementExpression, ProductInstanceFunctionType, SEMVER } from '@wcp/wcpshared';
import DBVersionModel from '../models/DBVersionSchema';
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
        var promises: Promise<any>[] = [];
        const WOptionModel = mongoose.model('woptionschema', new Schema({ option_type_id: Schema.Types.Mixed, enable_function: Schema.Types.Mixed }));
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
              // @ts-ignore
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
        const WProductModel = mongoose.model('wproductschema', new Schema({
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
        const WProductInstanceModel = mongoose.model('wproductinstanceschema', new Schema({ product_id: Schema.Types.Mixed }));
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
            if (c.parent_id === undefined || c.parent_id === null || String(c.parent_id) === "" ) {
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
          if_else?: IIfElseExpression;
          logical?: ILogicalExpression;
          modifier_placement?: IModifierPlacementExpression;
          has_any_of_modifier?: IHasAnyOfModifierExpression;
          discriminator: keyof typeof ProductInstanceFunctionType;
        };

        var promises: Promise<any>[] = [];
        const WProductInstanceFunctionModel = mongoose.model('WProductinstancefunction', new Schema({
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
      const WProductInstanceFunctionModel = mongoose.model('WProductinstancefunction', new Schema({
        name: { type: String, required: true },
        expression: {
          required: true,
          type: {
            expr: Schema.Types.Mixed,
            discriminator: { type: String, enum: ProductInstanceFunctionType, required: true },
          }
        }
      }));
      const res = await WProductInstanceFunctionModel.find();
      const convertRecursive = function (e: IAbstractExpression): IAbstractExpression {
        switch (e.discriminator) {
          case ProductInstanceFunctionType.ConstLiteral:
            // @ts-ignore
            return { discriminator: ProductInstanceFunctionType.ConstLiteral, expr: { discriminator: ConstLiteralDiscriminator.NUMBER, value: e.expr.value }};
            case ProductInstanceFunctionType.HasAnyOfModifierType:
              return e;
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
              return e;
        }
      }
      res.forEach(
        e => {
          // @ts-ignore
          e.expression = convertRecursive(e.expression);
          promises.push(e.save({}).then(() => {
            logger.debug(`Updated WProductInstanceFunction ${e.id} with discriminator based ConstLiteral expression: ${JSON.stringify(e.expression)}`);
          }).catch((err) => {
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

const DatabaseManagerInstance = new DatabaseManager();
export default DatabaseManagerInstance;
module.exports = DatabaseManagerInstance;