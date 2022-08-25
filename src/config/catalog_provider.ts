import {
  ICatalog,
  SEMVER,
  ICategory,
  IOption,
  IOptionType,
  IProduct,
  IProductInstance,
  IProductInstanceFunction,
  FindModifierPlacementExpressionsForMTID,
  FindHasAnyModifierExpressionsForMTID,
  AbstractExpressionModifierPlacementExpression,
  OrderInstanceFunction,
  ReduceArrayToMapByKey,
  RecordOrderInstanceFunctions,
  RecordProductInstanceFunctions,
  CatalogGenerator
} from "@wcp/wcpshared";
import DBVersionModel from '../models/DBVersionSchema';
import { WCategoryModel } from '../models/catalog/category/WCategorySchema';
import { WProductInstanceModel } from '../models/catalog/products/WProductInstanceSchema';
import { WProductModel } from '../models/catalog/products/WProductSchema';
import { WOptionModel } from '../models/catalog/options/WOptionSchema';
import { WOptionTypeModel } from '../models/catalog/options/WOptionTypeSchema';
import { WProductInstanceFunctionModel } from '../models/query/product/WProductInstanceFunction';
import { WOrderInstanceFunctionModel } from "../models/query/order/WOrderInstanceFunction";
import { DataProviderInstance } from "./dataprovider";
import { SocketIoProviderInstance } from "./socketio_provider";
import logger from '../logging';
import { WProvider } from "../types/WProvider";

const ValidateProductModifiersFunctionsCategories = function (modifiers: { mtid: string; enable: string | null; }[], category_ids: string[], catalog: CatalogProvider) {
  const found_all_modifiers = modifiers.map(entry =>
    catalog.ModifierTypes.some(x => x.id === entry.mtid) &&
    (entry.enable === null || Object.hasOwn(catalog.ProductInstanceFunctions, entry.enable))).every(x => x === true);
  const found_all_categories = category_ids.map(cid => Object.hasOwn(catalog.Categories, cid)).every(x => x === true);
  return found_all_categories && found_all_modifiers;
}

export class CatalogProvider implements WProvider {
  #categories: Record<string, ICategory>;
  #modifier_types: IOptionType[];
  #options: IOption[];
  #products: IProduct[];
  #product_instances: IProductInstance[];
  #product_instance_functions: RecordProductInstanceFunctions;
  #orderInstanceFunctions: RecordOrderInstanceFunctions;
  #catalog: ICatalog;
  #apiver: SEMVER;
  constructor() {
  }

  get Categories() {
    return this.#categories;
  }

  get ModifierTypes() {
    return this.#modifier_types;
  }

  get ModifierOptions() {
    return this.#options;
  }

  get Products() {
    return this.#products;
  }

  get ProductInstances() {
    return this.#product_instances;
  }

  get ProductInstanceFunctions() {
    return this.#product_instance_functions;
  }

  get OrderInstanceFunctions() {
    return this.#orderInstanceFunctions;
  }

  get Catalog() {
    return this.#catalog;
  }

  SyncCategories = async () => {
    // categories
    logger.debug(`Syncing Categories.`);
    try {
      this.#categories = ReduceArrayToMapByKey((await WCategoryModel.find().exec()).map(x => x.toObject()), 'id');
    } catch (err) {
      logger.error(`Failed fetching categories with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncModifierTypes = async () => {
    logger.debug(`Syncing Modifier Types.`);
    // modifier types
    try {
      this.#modifier_types = (await WOptionTypeModel.find().exec()).map(x => x.toObject());
    } catch (err) {
      logger.error(`Failed fetching option types with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncOptions = async () => {
    logger.debug(`Syncing Modifier Options.`);
    // modifier options
    try {
      this.#options = (await WOptionModel.find().exec()).map(x => x.toObject());
    } catch (err) {
      logger.error(`Failed fetching options with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncProducts = async () => {
    logger.debug(`Syncing Products.`);
    // products
    try {
      this.#products = (await WProductModel.find().exec()).map(x => x.toObject());
    } catch (err) {
      logger.error(`Failed fetching products with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncProductInstances = async () => {
    logger.debug(`Syncing Product Instances.`);
    // product instances
    try {
      this.#product_instances = (await WProductInstanceModel.find().exec()).map(x => x.toObject());
    } catch (err) {
      logger.error(`Failed fetching product instances with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncProductInstanceFunctions = async () => {
    logger.debug(`Syncing Product Instance Functions.`);
    try {
      this.#product_instance_functions = ReduceArrayToMapByKey((await WProductInstanceFunctionModel.find().exec()).map(x => x.toObject()), 'id');
    } catch (err) {
      logger.error(`Failed fetching product instance functions with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncOrderInstanceFunctions = async () => {
    logger.debug(`Syncing Order Instance Functions.`);
    try {
      this.#orderInstanceFunctions = ReduceArrayToMapByKey((await WOrderInstanceFunctionModel.find().exec()).map(x => x.toObject()), 'id');
    } catch (err) {
      logger.error(`Failed fetching order instance functions with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  RecomputeCatalog = () => {
    this.#catalog = CatalogGenerator(Object.values(this.#categories), this.#modifier_types, this.#options, this.#products, this.#product_instances, this.#product_instance_functions, this.#orderInstanceFunctions, this.#apiver);
  }

  Bootstrap = async () => {
    logger.info(`Starting Bootstrap of CatalogProvider, Loading catalog from database...`);

    this.#apiver = await DBVersionModel.findOne().exec()

    await Promise.all([
      this.SyncCategories(),
      this.SyncModifierTypes(),
      this.SyncOptions(),
      this.SyncProducts(),
      this.SyncProductInstances(),
      this.SyncProductInstanceFunctions(),
      this.SyncOrderInstanceFunctions()]);

    this.RecomputeCatalog();

    logger.info(`Finished Bootstrap of CatalogProvider`);
  };

  CreateCategory = async (category: Omit<ICategory, "id">) => {
    const doc = new WCategoryModel(category);
    await doc.save();
    await this.SyncCategories();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc;
  };

  UpdateCategory = async (category_id: string, category: Omit<ICategory, "id">) => {
    try {
      if (!Object.hasOwn(this.#categories, category_id)) {
        // not found
        return null;
      }
      var cycle_update_promise = null;
      if (this.#categories[category_id].parent_id !== category.parent_id && category.parent_id) {
        // need to check for potential cycle
        var cur = category.parent_id;
        while (cur && this.#categories[cur].parent_id !== category_id) {
          cur = this.#categories[cur].parent_id;
        }
        // if the cursor is not empty/null/blank then we stopped because we found the cycle
        if (cur) {
          logger.debug(`In changing ${category_id}'s parent_id to ${category.parent_id}, found cycle at ${cur}, blanking out ${cur}'s parent_id to prevent cycle.`);
          // this assignment to #categories seems suspect
          this.#categories[cur].parent_id = null;
          cycle_update_promise = WCategoryModel.findByIdAndUpdate(cur, { parent_id: null });
        }
      }
      const response = await WCategoryModel.findByIdAndUpdate(category_id, category);
      if (cycle_update_promise) {
        await cycle_update_promise;
      }
      await this.SyncCategories();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      // is this going to still be valid after the Sync above?
      return response.toObject();
    } catch (err) {
      throw err;
    }
  };

  DeleteCategory = async (category_id: string) => {
    logger.debug(`Removing ${category_id}`);
    try {
      // first make sure this isn't used in a fulfillment
      Object.values(DataProviderInstance.Fulfillments).map((x) => {
        if (x.menuBaseCategoryId === category_id) {
          throw Error(`CategoryId: ${category_id} found as Menu Base for FulfillmentId: ${x.id} (${x.displayName})`); 
        }
        if (x.orderBaseCategoryId === category_id) {
          throw Error(`CategoryId: ${category_id} found as Order Base for FulfillmentId: ${x.id} (${x.displayName})`); 
        }
        if (x.orderSupplementaryCategoryId === category_id) {
          throw Error(`CategoryId: ${category_id} found as Order Supplementary for FulfillmentId: ${x.id} (${x.displayName})`); 
        }
      });

      const doc = await WCategoryModel.findByIdAndDelete(category_id);
      if (!doc) {
        return null;
      }
      await Promise.all(Object.values(this.#categories).map(async (cat) => {
        if (cat.parent_id && cat.parent_id === category_id) {
          await WCategoryModel.findByIdAndUpdate(cat.id, { parent_id: null });
        }
      }));
      const products_update = await WProductModel.updateMany({}, { $pull: { category_ids: category_id } });
      if (products_update.modifiedCount > 0) {
        logger.debug(`Removed Category ID from ${products_update.modifiedCount} products.`);
        await this.SyncProducts();
      }
      await this.SyncCategories();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateModifierType = async (modifierType: Omit<IOptionType, "id">) => {
    const doc = new WOptionTypeModel(modifierType);
    await doc.save();
    await this.SyncModifierTypes();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc;
  };

  UpdateModifierType = async (id: string, modifierType: Omit<IOptionType, "id">) => {
    try {
      const updated = await WOptionTypeModel.findByIdAndUpdate(
        id,
        modifierType,
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncModifierTypes();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteModifierType = async (mt_id: string) => {
    logger.debug(`Removing Modifier Type: ${mt_id}`);
    try {
      const doc = await WOptionTypeModel.findByIdAndDelete(mt_id);
      if (!doc) {
        logger.warn("Unable to delete the ModifierType from the database.");
        return null;
      }
      const options_delete = await WOptionModel.deleteMany({ modifierTypeId: mt_id });
      if (this.#catalog.modifiers[mt_id].options.length !== options_delete.deletedCount) {
        logger.error(`Mismatch between number of modifier options deleted and the number the catalog sees as child of this modifier type.`);
      }
      if (options_delete.deletedCount > 0) {
        logger.debug(`Removed ${options_delete.deletedCount} Options from the catalog.`);
      }
      const products_update = await WProductModel.updateMany({}, { $pull: { modifiers: { mtid: mt_id } } });
      if (products_update.modifiedCount > 0) {
        const product_instance_update = await WProductInstanceModel.updateMany({}, { 'modifiers': { $unset: { [mt_id]: "" } } });
        logger.debug(`Removed ModifierType ID from ${products_update.modifiedCount} products, ${product_instance_update.modifiedCount} product instances.`);
        await this.SyncProducts();
        await this.SyncProductInstances();
      }
      // need to delete any ProductInstanceFunctions that use this MT
      await Promise.all(Object.values(this.#product_instance_functions).map(async (pif) => {
        if (FindModifierPlacementExpressionsForMTID(pif.expression, mt_id).length > 0) {
          logger.debug(`Found product instance function composed of ${mt_id}, removing PIF with ID: ${pif.id}.`);
          // the PIF and any dependent objects will be synced, but the catalog will not be recomputed / emitted
          await this.DeleteProductInstanceFunction(pif.id, true);
        } else if (FindHasAnyModifierExpressionsForMTID(pif.expression, mt_id).length > 0) {
          logger.debug(`Found product instance function composed of ${mt_id}, removing PIF with ID: ${pif.id}.`);
          // the PIF and any dependent objects will be synced, but the catalog will not be recomputed / emitted
          await this.DeleteProductInstanceFunction(pif.id, true);
        }
      }));
      await this.SyncOptions();
      await this.SyncModifierTypes();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateOption = async (modifierOption: Omit<IOption, 'id'>) => {
    // first find the Modifier Type ID in the catalog
    var option_type = this.#modifier_types.find(x => x.id === modifierOption.modifierTypeId);
    if (!option_type) {
      return null;
    }

    const doc = new WOptionModel(modifierOption);
    await doc.save();
    await this.SyncOptions();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc;
  };

  UpdateModifierOption = async (id: string, modifierOption: Omit<IOption, 'id' | 'modifierTypeId'>) => {
    try {
      //TODO: post update: rebuild all products with the said modifier option since the ordinal might have changed
      // 
      const updated = await WOptionModel.findByIdAndUpdate(
        id,
        modifierOption,
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncOptions();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteModifierOption = async (mo_id: string) => {
    logger.debug(`Removing Modifier Option ${mo_id}`);
    try {
      const doc = await WOptionModel.findByIdAndDelete(mo_id);
      if (!doc) {
        return null;
      }
      const product_instance_options_delete = await WProductInstanceModel.updateMany(
        { },
        { $pull: { "modifiers.$.options": { option_id: mo_id } } });
      if (product_instance_options_delete.modifiedCount > 0) {
        logger.debug(`Removed ${product_instance_options_delete.modifiedCount} Options from Product Instances.`);
        await this.SyncProductInstances();
      }
      await this.SyncOptions();
      // need to delete any ProductInstanceFunctions that use this MO
      await Promise.all(Object.values(this.#product_instance_functions).map(async (pif) => {
        const dependent_pfi_expressions = FindModifierPlacementExpressionsForMTID(pif.expression, doc.modifierTypeId) as AbstractExpressionModifierPlacementExpression[];
        const filtered = dependent_pfi_expressions.filter(x => x.expr.moid === mo_id)
        if (filtered.length > 0) {
          logger.debug(`Found product instance function composed of ${doc.modifierTypeId}:${mo_id}, removing PIF with ID: ${pif.id}.`);
          // the PIF and any dependent objects will be synced, but the catalog will not be recomputed / emitted
          await this.DeleteProductInstanceFunction(pif.id, true);
        }
      }));
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateProduct = async (product: Omit<IProduct, 'id'>, suppress_catalog_recomputation = false) => {
    if (!ValidateProductModifiersFunctionsCategories(product.modifiers, product.category_ids, this)) {
      return null;
    }
    const doc = new WProductModel(product);
    await doc.save();
    await this.SyncProducts();
    if (!suppress_catalog_recomputation) {
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
    }
    return doc;
  };

  UpdateProduct = async (pid: string, product: Omit<IProduct, 'id'>) => {
    try {
      if (!ValidateProductModifiersFunctionsCategories(product.modifiers, product.category_ids, this)) {
        return null;
      }
      const old_modifiers = this.#catalog.products[pid].product.modifiers.map(x => x.mtid.toString());
      const new_modifiers_mtids = product.modifiers.map(x => String(x.mtid));
      const removed_modifiers = old_modifiers.filter(x => !new_modifiers_mtids.includes(x));
      const updated = await WProductModel.findByIdAndUpdate(
        pid,
        product,
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }

      if (removed_modifiers.length) {
        await Promise.all(removed_modifiers.map(async (mtid) => {
          /// TODO: FIX THIS !!!!!!! BEFORE SHIP check the other $unset example 
          const product_instance_update = await WProductInstanceModel.updateMany({ productId: pid }, { modifiers: { $unset: { mtid } } });
          logger.debug(`Removed ModifierType ID ${mtid} from ${product_instance_update.modifiedCount} product instances.`);
        }));
        await this.SyncProductInstances();
      }

      await this.SyncProducts();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProduct = async (p_id: string) => {
    logger.debug(`Removing Product ${p_id}`);
    try {
      const doc = await WProductModel.findByIdAndDelete(p_id);
      if (!doc) {
        return null;
      }
      const product_instance_delete = await WProductInstanceModel.deleteMany({ productId: p_id });
      if (product_instance_delete.deletedCount > 0) {
        logger.debug(`Removed ${product_instance_delete.deletedCount} Product Instances.`);
        await this.SyncProductInstances();
      }
      await this.SyncProducts();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateProductInstance = async (productInstance: Omit<IProductInstance, 'id'>) => {
    const doc = new WProductInstanceModel(productInstance);
    await doc.save();
    await this.SyncProductInstances();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc;
  };

  UpdateProductInstance = async (piid: string, productInstance: Omit<IProductInstance, 'id' | 'productId'>) => {
    try {
      const updated = await WProductInstanceModel.findByIdAndUpdate(
        piid,
        productInstance,
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }

      await this.SyncProductInstances();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProductInstance = async (pi_id: string) => {
    logger.debug(`Removing Product Instance: ${pi_id}`);
    try {
      const doc = await WProductInstanceModel.findByIdAndDelete(pi_id);
      if (!doc) {
        return null;
      }
      await this.SyncProductInstances();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateProductInstanceFunction = async (productInstanceFunction: Omit<IProductInstanceFunction, 'id'>) => {
    const doc = new WProductInstanceFunctionModel(productInstanceFunction);
    await doc.save();
    await this.SyncProductInstanceFunctions();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc;
  };

  UpdateProductInstanceFunction = async (pif_id: string, productInstanceFunction: Omit<IProductInstanceFunction, 'id'>) => {
    try {
      const updated = await WProductInstanceFunctionModel.findByIdAndUpdate(
        pif_id,
        productInstanceFunction,
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncProductInstanceFunctions();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProductInstanceFunction = async (pif_id: string, suppress_catalog_recomputation = false) => {
    logger.debug(`Removing Product Instance Function: ${pif_id}`);
    try {
      const doc = await WProductInstanceFunctionModel.findByIdAndDelete(pif_id);
      if (!doc) {
        return null;
      }
      const options_update = await WOptionModel.updateMany(
        { enable_function: pif_id },
        { $set: { "enable_function": null } });
      if (options_update.modifiedCount > 0) {
        logger.debug(`Removed ${doc} from ${options_update.modifiedCount} Modifier Options.`);
        await this.SyncOptions();
      }
      const products_update = await WProductModel.updateMany(
        { "modifiers.enable": pif_id },
        { $set: { "modifiers.$.enable": null } });
      if (products_update.modifiedCount > 0) {
        logger.debug(`Removed ${doc} from ${products_update.modifiedCount} Products.`);
        await this.SyncProducts();
      }

      await this.SyncProductInstanceFunctions();
      if (!suppress_catalog_recomputation) {
        this.RecomputeCatalog();
        SocketIoProviderInstance.EmitCatalog(this.#catalog);
      }
      return doc;
    } catch (err) {
      throw err;
    }

  }
  CreateOrderInstanceFunction = async (orderInstanceFunction: Omit<OrderInstanceFunction, 'id'>) => {
    const doc = new WOrderInstanceFunctionModel(orderInstanceFunction);
    await doc.save();
    await this.SyncOrderInstanceFunctions();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc;
  };

  UpdateOrderInstanceFunction = async (id: string, orderInstanceFunction: Omit<OrderInstanceFunction, 'id'>) => {
    try {
      const updated = await WOrderInstanceFunctionModel.findByIdAndUpdate(
        id,
        orderInstanceFunction,
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncOrderInstanceFunctions();
      this.RecomputeCatalog();
      SocketIoProviderInstance.EmitCatalog(this.#catalog);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteOrderInstanceFunction = async (id: string, suppress_catalog_recomputation = false) => {
    logger.debug(`Removing Order Instance Function: ${id}`);
    try {
      const doc = await WOrderInstanceFunctionModel.findByIdAndDelete(id);
      if (!doc) {
        return null;
      }
      await this.SyncOrderInstanceFunctions();
      if (!suppress_catalog_recomputation) {
        this.RecomputeCatalog();
        SocketIoProviderInstance.EmitCatalog(this.#catalog);
      }
      return doc;
    } catch (err) {
      throw err;
    }
  }
}

export const CatalogProviderInstance = new CatalogProvider();
