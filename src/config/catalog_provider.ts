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
  CatalogGenerator,
  ICatalogSelectorWrapper,
  KeyValue,
  PrinterGroup
} from "@wcp/wcpshared";
import DBVersionModel from '../models/DBVersionSchema';
import { WCategoryModel } from '../models/catalog/category/WCategorySchema';
import { WProductInstanceModel } from '../models/catalog/products/WProductInstanceSchema';
import { WProductModel } from '../models/catalog/products/WProductSchema';
import { WOptionModel } from '../models/catalog/options/WOptionSchema';
import { WOptionTypeModel } from '../models/catalog/options/WOptionTypeSchema';
import { WProductInstanceFunctionModel } from '../models/query/product/WProductInstanceFunction';
import { WOrderInstanceFunctionModel } from "../models/query/order/WOrderInstanceFunction";
import { PrinterGroupModel } from "../models/catalog/WPrinterGroupSchema";
import { DataProviderInstance } from "./dataprovider";
import { SocketIoProviderInstance } from "./socketio_provider";
import logger from '../logging';
import { WProvider } from "../types/WProvider";
import { SquareProviderInstance } from "./square";
import { GetSquareExternalIds, GetSquareIdIndexFromExternalIds, IdMappingsToExternalIds, ModifierOptionToSquareCatalogObject, PrinterGroupToSquareCatalogObjectPlusDummyProduct, ProductInstanceToSquareCatalogObject, WARIO_SQUARE_ID_METADATA_KEY } from "./SquareWarioBridge";
import { CatalogObject } from "square";

const ValidateProductModifiersFunctionsCategories = function (modifiers: { mtid: string; enable: string | null; }[], category_ids: string[], catalog: CatalogProvider) {
  const found_all_modifiers = modifiers.map(entry =>
    catalog.ModifierTypes.some(x => x.id === entry.mtid) &&
    (entry.enable === null || Object.hasOwn(catalog.ProductInstanceFunctions, entry.enable))).every(x => x === true);
  const found_all_categories = category_ids.map(cid => Object.hasOwn(catalog.Categories, cid)).every(x => x === true);
  return found_all_categories && found_all_modifiers;
}

const BatchDeleteCatalogObjectsFromExternalIds = async (externalIds: KeyValue[]) => {
  const squareKV = externalIds.filter(x => x.key.startsWith(WARIO_SQUARE_ID_METADATA_KEY));
  const squareKeys = squareKV.map(x => x.key.substring(WARIO_SQUARE_ID_METADATA_KEY.length));
  const squareValues = squareKV.map(x => x.value);
  logger.debug(`Removing ${squareKeys.join(", ")} from Square: ${squareValues.join(", ")}`);
  return await SquareProviderInstance.BatchDeleteCatalogObjects(squareKV.map(x => x.value));
}

type UpdateProductInstanceProps = {
  piid: string;
  product: Pick<IProduct, 'price' | 'modifiers' | 'printerGroup'>;
  productInstance: Partial<Omit<IProductInstance, 'id' | 'productId'>>;
};

type UpdatePrinterGroupProps = { 
  id: string;
  printerGroup: Partial<Omit<PrinterGroup, 'id'>>;
};

type UpdateModifierOptionProps = {
  id: string;
  modifierOption: Partial<Omit<IOption, 'id' | 'modifierTypeId'>>;
};
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export class CatalogProvider implements WProvider {
  #categories: Record<string, ICategory>;
  #printerGroups: Record<string, PrinterGroup>;
  #modifier_types: IOptionType[];
  #options: IOption[];
  #products: IProduct[];
  #product_instances: IProductInstance[];
  #product_instance_functions: RecordProductInstanceFunctions;
  #orderInstanceFunctions: RecordOrderInstanceFunctions;
  #catalog: ICatalog;
  #apiver: SEMVER;
  constructor() {
    this.#apiver = { major: 0, minor: 0, patch: 0 };
  }

  get PrinterGroups() {
    return this.#printerGroups;
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

  get CatalogSelectors() {
    return ICatalogSelectorWrapper(this.#catalog);
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

  SyncPrinterGroups = async () => {
    logger.debug(`Syncing Printer Groups.`);
    try {
      this.#printerGroups = ReduceArrayToMapByKey((await PrinterGroupModel.find().exec()).map(x => x.toObject()), 'id');
    } catch (err) {
      logger.error(`Failed fetching printer groups with error: ${JSON.stringify(err)}`);
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
    logger.debug('Recomputing catalog');
    this.#catalog = CatalogGenerator(Object.values(this.#categories), this.#modifier_types, this.#options, this.#products, this.#product_instances, this.#product_instance_functions, this.#orderInstanceFunctions, this.#apiver);
  }

  RecomputeCatalogAndEmit = () => {
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
  }

  CheckAllPrinterGroupsSquareIdsAndFixIfNeeded = async () => {
    const batches = Object.values(this.#printerGroups)
      .filter(pg => GetSquareIdIndexFromExternalIds(pg.externalIDs, 'CATEGORY') === -1)
      .map(pg => ({ id: pg.id, printerGroup: {} } as UpdatePrinterGroupProps));
    return batches.length > 0 ? await this.BatchUpdatePrinterGroup(batches) : null;
  }

  CheckAllModifierOptionsHaveSquareIdsAndFixIfNeeded = async () => {
    const batches = this.#options
      .filter(opt => GetSquareIdIndexFromExternalIds(opt.externalIDs, 'MODIFIER_LIST') === -1)
      .map(opt => ({ id: opt.id, modifierOption: {} } as UpdateModifierOptionProps));
    return batches.length > 0 ? await this.BatchUpdateModifierOption(batches, true) : null;
  }

  CheckAllProductsHaveSquareIdsAndFixIfNeeded = async () => {
    const batches = Object.values(this.#catalog.products)
      .map(p => p.instances
        .filter(piid => GetSquareIdIndexFromExternalIds(this.#catalog.productInstances[piid]!.externalIDs, "ITEM") === -1)
        .map(piid => ({ piid, product: { modifiers: p.product.modifiers, price: p.product.price }, productInstance: {} } as UpdateProductInstanceProps)))
      .flat();
    return batches.length > 0 ? await this.BatchUpdateProductInstance(batches, true) : null;
  }

  Bootstrap = async () => {
    logger.info(`Starting Bootstrap of CatalogProvider, Loading catalog from database...`);

    const newVer = await DBVersionModel.findOne().exec()!;
    this.#apiver = newVer!;

    await Promise.all([
      this.SyncPrinterGroups(),
      this.SyncCategories(),
      this.SyncModifierTypes(),
      this.SyncOptions(),
      this.SyncProducts(),
      this.SyncProductInstances(),
      this.SyncProductInstanceFunctions(),
      this.SyncOrderInstanceFunctions()]);

    this.RecomputeCatalog();
    await this.CheckAllPrinterGroupsSquareIdsAndFixIfNeeded();
    await this.CheckAllModifierOptionsHaveSquareIdsAndFixIfNeeded();
    await this.CheckAllProductsHaveSquareIdsAndFixIfNeeded();

    await this.SyncOptions();
    await this.SyncProducts();
    this.RecomputeCatalog();

    logger.info(`Finished Bootstrap of CatalogProvider`);
  };

  CreatePrinterGroup = async (printerGroup: Omit<PrinterGroup, "id">) => {
    logger.info(`Creating Printer Group: ${JSON.stringify(printerGroup)}`);
    const upsertResponse = 
      await SquareProviderInstance.BatchUpsertCatalogObjects([{ 
        objects: PrinterGroupToSquareCatalogObjectPlusDummyProduct(
          [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE], printerGroup, [], "")}]);
    if (!upsertResponse.success) {
      logger.error(`failed to add square category, got errors: ${JSON.stringify(upsertResponse.error)}`);
      return null;
    }

    const doc = new PrinterGroupModel({ 
      ...printerGroup,
      externalIDs: [...printerGroup.externalIDs, ...IdMappingsToExternalIds(upsertResponse.result.idMappings, "")]
    });
    await doc.save();
    await this.SyncPrinterGroups();
    return doc;
  };

  BatchUpdatePrinterGroup = async (batches: UpdatePrinterGroupProps[]): Promise<(PrinterGroup | null)[]> => {
    logger.info(`Updating printer group(s) ${batches.map(x => `ID: ${x.id}, changes: ${JSON.stringify(x.printerGroup)}`).join(", ")}`);

    const oldPGs = batches.map(b => this.#printerGroups[b.id]!);
    const newExternalIdses = batches.map((b, i) => b.printerGroup.externalIDs ?? oldPGs[i].externalIDs);
    const existingSquareExternalIds = newExternalIdses.map((ids) => GetSquareExternalIds(ids)).flat();
    let existingSquareObjects: CatalogObject[] = [];
    if (existingSquareExternalIds.length > 0) {
      const batchRetrieveCatalogObjectsResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(existingSquareExternalIds.map(x => x.value), false);
      if (!batchRetrieveCatalogObjectsResponse.success) {
        logger.error(`Getting current square CatalogObjects failed with ${JSON.stringify(batchRetrieveCatalogObjectsResponse.error)}`);
        return batches.map(_ => null);
      }
      existingSquareObjects = batchRetrieveCatalogObjectsResponse.result.objects ?? [];
    }

    const catalogObjects = batches.map((b, i) =>
      PrinterGroupToSquareCatalogObjectPlusDummyProduct(
        [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE],
        { ...oldPGs[i], ...b.printerGroup },
        existingSquareObjects, 
        ('000' + i).slice(-3)));
    const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects(catalogObjects.map(x => ({ objects: x })));
    if (!upsertResponse.success) {
      logger.error(`Failed to update square categories, got errors: ${JSON.stringify(upsertResponse.error)}`);
      return batches.map(_ => null);
    }

    const mappings = upsertResponse.result.idMappings;

    const updated = await Promise.all(batches.map(async (b, i) => {
      const doc = await PrinterGroupModel
        .findByIdAndUpdate(b.id,
          {
            ...b.printerGroup,
            externalIDs: [...newExternalIdses[i], ...IdMappingsToExternalIds(mappings, ('000' + i).slice(-3))]
          }, { new: true })
        .exec();
      if (!doc) {
        return null;
      }
      return doc;
    }));

    this.SyncPrinterGroups();
    return updated;
  }

  UpdatePrinterGroup = async (props: UpdatePrinterGroupProps) => {
    return (await this.BatchUpdatePrinterGroup([props]))[0];
  };

  DeletePrinterGroup = async (id: string) => {
    logger.debug(`Removing Printer Group ${id}`);
    const doc = await PrinterGroupModel.findByIdAndDelete(id).exec();
    if (!doc) {
      return null;
    }

    // NOTE: this removes the category from the Square ITEMs as well
    await BatchDeleteCatalogObjectsFromExternalIds(doc.externalIDs);

    await this.SyncPrinterGroups();

    const product_printer_group_delete = await WProductModel.updateMany(
      { "printerGroup": doc.id },
      { "printerGroup": null }).exec();
    if (product_printer_group_delete.modifiedCount > 0) {
      logger.debug(`Removed printer group from ${product_printer_group_delete.modifiedCount} Products.`);
      await this.SyncProducts();
      this.RecomputeCatalogAndEmit();
    }
    return doc;
  }

  CreateCategory = async (category: Omit<ICategory, "id">) => {
    const doc = new WCategoryModel(category);
    await doc.save();
    await this.SyncCategories();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc;
  };

  UpdateCategory = async (category_id: string, category: Omit<ICategory, "id">) => {
    if (!Object.hasOwn(this.#categories, category_id)) {
      // not found
      return null;
    }
    let cycle_update_promise = null;
    if (this.#categories[category_id].parent_id !== category.parent_id && category.parent_id) {
      // need to check for potential cycle
      let cur: string | null = category.parent_id;
      while (cur && this.#categories[cur]!.parent_id !== category_id) {
        cur = this.#categories[cur]!.parent_id;
      }
      // if the cursor is not empty/null/blank then we stopped because we found the cycle
      if (cur) {
        logger.debug(`In changing ${category_id}'s parent_id to ${category.parent_id}, found cycle at ${cur}, blanking out ${cur}'s parent_id to prevent cycle.`);
        // this assignment to #categories seems suspect
        this.#categories[cur].parent_id = null;
        cycle_update_promise = WCategoryModel.findByIdAndUpdate(cur, { parent_id: null }).exec();
      }
    }
    const response = await WCategoryModel.findByIdAndUpdate(category_id, category).exec();
    if (cycle_update_promise) {
      await cycle_update_promise;
    }
    await this.SyncCategories();
    this.RecomputeCatalogAndEmit();
    // is this going to still be valid after the Sync above?
    return response!.toObject();
  };

  DeleteCategory = async (category_id: string) => {
    logger.debug(`Removing ${category_id}`);
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

    const doc = await WCategoryModel.findByIdAndDelete(category_id).exec();
    if (!doc) {
      return null;
    }
    await Promise.all(Object.values(this.#categories).map(async (cat) => {
      if (cat.parent_id && cat.parent_id === category_id) {
        await WCategoryModel.findByIdAndUpdate(cat.id, { parent_id: null }).exec();
      }
    }));
    const products_update = await WProductModel.updateMany({}, { $pull: { category_ids: category_id } }).exec();
    if (products_update.modifiedCount > 0) {
      logger.debug(`Removed Category ID from ${products_update.modifiedCount} products.`);
      await this.SyncProducts();
    }
    await this.SyncCategories();
    this.RecomputeCatalogAndEmit();
    return doc;
  }

  CreateModifierType = async (modifierType: Omit<IOptionType, "id">) => {
    const doc = new WOptionTypeModel(modifierType);
    await doc.save();
    await this.SyncModifierTypes();
    // NOTE: we don't make anything in the square catalog for just the modifier type
    this.RecomputeCatalogAndEmit();
    return doc;
  };

  UpdateModifierType = async (id: string, modifierType: Partial<Omit<IOptionType, "id">>) => {
    const updated = await WOptionTypeModel
      .findByIdAndUpdate(id, modifierType, { new: true })
      .exec();
    if (!updated) {
      return null;
    }
    // NOTE: we don't make anything in the square catalog for just the modifier type
    await this.SyncModifierTypes();
    this.RecomputeCatalogAndEmit();
    return updated;
  };

  DeleteModifierType = async (mt_id: string) => {
    logger.debug(`Removing Modifier Type: ${mt_id}`);
    const doc = await WOptionTypeModel.findByIdAndDelete(mt_id).exec();
    if (!doc) {
      logger.warn("Unable to delete the ModifierType from the database.");
      return null;
    }

    await Promise.all(this.#catalog.modifiers[mt_id].options.map(op => this.DeleteModifierOption(op, true)))

    const products_update = await WProductModel
      .updateMany({}, { $pull: { modifiers: { mtid: mt_id } } })
      .exec();
    if (products_update.modifiedCount > 0) {
      const product_instance_update = await WProductInstanceModel.updateMany({}, { $pull: { modifiers: { modifierTypeId: mt_id } } }).exec();
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
    this.RecomputeCatalogAndEmit();
    return doc;
  }

  CreateOption = async (modifierOption: Omit<IOption, 'id'>) => {
    // first find the Modifier Type ID in the catalog
    if (!Object.hasOwn(this.Catalog.modifiers, modifierOption.modifierTypeId)) {
      return null;
    }
    // First create the square modifier
    const modifierEntry = this.Catalog.modifiers[modifierOption.modifierTypeId];
    const upsertResponse = await SquareProviderInstance.UpsertCatalogObject(
      ModifierOptionToSquareCatalogObject(
        [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE],
        modifierEntry.modifierType.ordinal, 
        modifierOption, 
        [], 
        ""));
    if (!upsertResponse.success) {
      logger.error(`failed to add square modifiers, got errors: ${JSON.stringify(upsertResponse.error)}`);
      return null;
    }
    // add the modifier to all items that reference this modifier option's modifierTypeId
    const productUpdates = Object.values(this.#catalog.products)
      .filter(p => p.product.modifiers.findIndex(x => x.mtid === modifierOption.modifierTypeId) !== -1)
      .map((p) => p.instances.map(piid => ({ 
        piid, 
        product: { modifiers: p.product.modifiers, price: p.product.price, printerGroup: p.product.printerGroup }, 
        productInstance: {} }))).flat();
    if (productUpdates.length > 0) {
      await this.BatchUpdateProductInstance(productUpdates, true);
      // explicitly don't need to sync the product instances here since we're just making this batch call for square product updates
    }

    const doc = new WOptionModel({
      ...modifierOption,
      externalIDs: [...modifierOption.externalIDs, ...IdMappingsToExternalIds(upsertResponse.result!.idMappings, "")]
    });
    await doc.save();
    await this.SyncOptions();
    this.RecomputeCatalogAndEmit();
    return doc;
  };

  UpdateModifierOption = async (props: UpdateModifierOptionProps, suppress_catalog_recomputation: boolean = false) => {
    return (await this.BatchUpdateModifierOption([props], suppress_catalog_recomputation))[0];
  };

  BatchUpdateModifierOption = async (batches: UpdateModifierOptionProps[], suppress_catalog_recomputation: boolean = false) => {
    logger.info(`Request to update ModifierOption(s) ${batches.map(b => `ID: ${b.id}, updates: ${JSON.stringify(b.modifierOption)}`).join(", ")}${suppress_catalog_recomputation ? " suppressing catalog recomputation" : ""}`);

    //TODO: post update: rebuild all products with the said modifier option since the ordinal might have changed

    const oldOptions = batches.map(b => this.#catalog.options[b.id]!);
    const newExternalIdses = batches.map((b, i) => b.modifierOption.externalIDs ?? oldOptions[i].externalIDs);
    const squareCatalogObjectsToDelete: string[] = [];
    batches.forEach((b, i) => {
      if (b.modifierOption.metadata) {
        if (b.modifierOption.metadata.allowHeavy === false && oldOptions[i].metadata.allowHeavy === true) {
          const kv = newExternalIdses[i].splice(GetSquareIdIndexFromExternalIds(newExternalIdses[i], 'MODIFIER_HEAVY'))[0];
          squareCatalogObjectsToDelete.push(kv.value);
        }
        if (b.modifierOption.metadata.allowLite === false && oldOptions[i].metadata.allowLite === true) {
          const kv = newExternalIdses[i].splice(GetSquareIdIndexFromExternalIds(newExternalIdses[i], 'MODIFIER_LITE'))[0];
          squareCatalogObjectsToDelete.push(kv.value);
        }
        if (b.modifierOption.metadata.allowOTS === false && oldOptions[i].metadata.allowOTS === true) {
          const kv = newExternalIdses[i].splice(GetSquareIdIndexFromExternalIds(newExternalIdses[i], 'MODIFIER_OTS'))[0];
          squareCatalogObjectsToDelete.push(kv.value);
        }
        if (b.modifierOption.metadata.can_split === false && oldOptions[i].metadata.can_split === true) {
          const kvL = newExternalIdses[i].splice(GetSquareIdIndexFromExternalIds(newExternalIdses[i], 'MODIFIER_LEFT'))[0];
          const kvR = newExternalIdses[i].splice(GetSquareIdIndexFromExternalIds(newExternalIdses[i], 'MODIFIER_RIGHT'))[0];
          squareCatalogObjectsToDelete.push(kvL.value, kvR.value);
        }
      }
    })

    if (squareCatalogObjectsToDelete.length > 0) {
      logger.info(`Deleting Square Catalog Modifiers due to ModifierOption update: ${squareCatalogObjectsToDelete.join(', ')}`);
      await SquareProviderInstance.BatchDeleteCatalogObjects(squareCatalogObjectsToDelete);
    }
    const existingSquareExternalIds = newExternalIdses.map((ids) => GetSquareExternalIds(ids)).flat();
    let existingSquareObjects: CatalogObject[] = [];
    if (existingSquareExternalIds.length > 0) {
      const batchRetrieveCatalogObjectsResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(existingSquareExternalIds.map(x => x.value), false);
      if (!batchRetrieveCatalogObjectsResponse.success) {
        logger.error(`Getting current square CatalogObjects failed with ${JSON.stringify(batchRetrieveCatalogObjectsResponse.error)}`);
        return batches.map(_ => null);
      }
      existingSquareObjects = batchRetrieveCatalogObjectsResponse.result.objects ?? [];
    }
    const catalogObjects = batches.map((b, i) => {
      const modifierTypeOrdinal = this.CatalogSelectors.modifierEntry(oldOptions[i].modifierTypeId)!.modifierType.ordinal;
      return ModifierOptionToSquareCatalogObject(
        [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE],
        modifierTypeOrdinal,
        {
          ...oldOptions[i],
          ...b.modifierOption,
          externalIDs: newExternalIdses[i]
        },
        existingSquareObjects,
        ('000' + i).slice(-3))

    })

    const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects(catalogObjects.map(x => ({ objects: [x] })));
    if (!upsertResponse.success) {
      logger.error(`Failed to update square product, got errors: ${JSON.stringify(upsertResponse.error)}`);
      return batches.map(_ => null);
    }

    
    const mappings = upsertResponse.result.idMappings;

    const updated = await Promise.all(batches.map(async (b, i) => {
      const doc = await WOptionModel
        .findByIdAndUpdate(b.id,
          {
            ...b.modifierOption,
            externalIDs: [...newExternalIdses[i], ...IdMappingsToExternalIds(mappings, ('000' + i).slice(-3))]
          }, { new: true })
        .exec();
      if (!doc) {
        return null;
      }
      return doc;
    }));

    if (!suppress_catalog_recomputation) {
      await this.SyncOptions();
      this.RecomputeCatalogAndEmit();
    }
    return updated;
  };

  DeleteModifierOption = async (mo_id: string, suppress_catalog_recomputation: boolean = false) => {
    logger.debug(`Removing Modifier Option ${mo_id}`);
    const doc = await WOptionModel.findByIdAndDelete(mo_id).exec();
    if (!doc) {
      return null;
    }

    // NOTE: this removes the modifiers from the Square ITEMs and ITEM_VARIATIONs as well
    await BatchDeleteCatalogObjectsFromExternalIds(doc.externalIDs);

    const product_instance_options_delete = await WProductInstanceModel.updateMany(
      { "modifiers.modifierTypeId": doc.modifierTypeId },
      { $pull: { "modifiers.$.options": { optionId: mo_id } } }).exec();
    if (product_instance_options_delete.modifiedCount > 0) {
      logger.debug(`Removed ${product_instance_options_delete.modifiedCount} Options from Product Instances.`);
      // TODO: run query for any modifiers.options.length === 0
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
    if (!suppress_catalog_recomputation) {
      this.RecomputeCatalogAndEmit();
    }
    return doc;
  }

  CreateProduct = async (product: Omit<IProduct, 'id' | 'baseProductId'>, instance: Omit<IProductInstance, 'id' | 'productId'>) => {
    if (!ValidateProductModifiersFunctionsCategories(product.modifiers, product.category_ids, this)) {
      return null;
    }
    // add the product instance to the square catalog here
    const upsertResponse = await SquareProviderInstance.UpsertCatalogObject(
      ProductInstanceToSquareCatalogObject(
        [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE],
        product, 
        instance,
        product.printerGroup ? this.#printerGroups[product.printerGroup] : null,
        this.CatalogSelectors, 
        [], 
        ""));
    if (!upsertResponse.success) {
      logger.error(`failed to add product, got errors: ${JSON.stringify(upsertResponse.error)}`);
      return null;
    }

    const doc = new WProductModel(product);
    const savedProduct = await doc.save();
    logger.debug(`Saved new WProductModel: ${JSON.stringify(savedProduct.toObject())}`);
    const pi = new WProductInstanceModel({
      ...instance,
      productId: savedProduct.id,
      externalIDs: [...instance.externalIDs, ...IdMappingsToExternalIds(upsertResponse.result.idMappings, "")]
    });
    const piDoc = await pi.save();
    logger.debug(`Saved new product instance: ${JSON.stringify(piDoc.toObject())}`);
    savedProduct.baseProductId = piDoc.id;
    await savedProduct.save();

    await Promise.all([this.SyncProducts(), this.SyncProductInstances()]);

    this.RecomputeCatalogAndEmit();
    return piDoc;
  };

  UpdateProduct = async (pid: string, product: Partial<Omit<IProduct, 'id'>>) => {
    if (!ValidateProductModifiersFunctionsCategories(product.modifiers ?? [], product.category_ids ?? [], this)) {
      return null;
    }
    const oldProductEntry = this.Catalog.products[pid];
    const updated = await WProductModel
      .findByIdAndUpdate(pid, product, { new: true })
      .exec();
    if (!updated) {
      return null;
    }
    let removedModifierTypes: string[] = [];
    let addedModifierTypes = false;
    const adjustedPrice = product.price && product.price !== oldProductEntry.product.price ? product.price : null;
    const adjustedPrinterGroup = product.printerGroup !== oldProductEntry.product.printerGroup;
    if (product.modifiers) {
      const oldModifierTypes = oldProductEntry.product.modifiers.map(x => x.mtid);
      const newModifierTypes = product.modifiers.map(x => x.mtid);
      removedModifierTypes = oldModifierTypes.filter(x => !newModifierTypes.includes(x));
      addedModifierTypes = newModifierTypes.filter(x => !oldModifierTypes.includes(x)).length > 0;
    }

    const batchProductInstanceUpdates = oldProductEntry.instances
      .map((piId) => this.Catalog.productInstances[piId]!)
      .filter(pi => adjustedPrice !== null ||
        addedModifierTypes ||
        pi.modifiers.filter(mod => removedModifierTypes.includes(mod.modifierTypeId)).length > 0)
      .map((pi) => ({
        piid: pi.id,
        product: { modifiers: updated.modifiers, price: updated.price, printerGroup: updated.printerGroup },
        productInstance: {
          modifiers: pi.modifiers.filter(x => !removedModifierTypes.includes(x.modifierTypeId))
        }
      }));

    if (batchProductInstanceUpdates.length > 0) {
      await this.BatchUpdateProductInstance(batchProductInstanceUpdates, true);
      await this.SyncProductInstances();
    }

    await this.SyncProducts();
    this.RecomputeCatalogAndEmit();
    return updated;
  };

  DeleteProduct = async (p_id: string) => {
    logger.debug(`Removing Product ${p_id}`);
    const productEntry = this.#catalog.products[p_id]!;

    const doc = await WProductModel.findByIdAndDelete(p_id).exec();
    if (!doc) {
      return null;
    }
    // removing ALL product instances from Square
    await BatchDeleteCatalogObjectsFromExternalIds(productEntry.instances.reduce((acc, pi) => [...acc, ...this.#catalog.productInstances[pi]!.externalIDs], []));

    const product_instance_delete = await WProductInstanceModel.deleteMany({ productId: p_id }).exec();
    if (product_instance_delete.deletedCount > 0) {
      logger.debug(`Removed ${product_instance_delete.deletedCount} Product Instances.`);
      await this.SyncProductInstances();
    }
    await this.SyncProducts();
    this.RecomputeCatalogAndEmit();
    return doc;
  }

  CreateProductInstance = async (productInstance: Omit<IProductInstance, 'id'>) => {
    // add the product instance to the square catalog here
    const product = this.#catalog.products[productInstance.productId]!.product;
    const upsertResponse = await SquareProviderInstance.UpsertCatalogObject(ProductInstanceToSquareCatalogObject(
      [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE],
      product, 
      productInstance,
      product.printerGroup ? this.#printerGroups[product.printerGroup] : null,
      this.CatalogSelectors, 
      [], 
      ""));
    if (!upsertResponse.success) {
      logger.error(`failed to add square product, got errors: ${JSON.stringify(upsertResponse.error)}`);
      return null;
    }
    const doc = new WProductInstanceModel({
      ...productInstance,
      externalIDs: [...productInstance.externalIDs, ...IdMappingsToExternalIds(upsertResponse.result.idMappings, "")]
    });
    await doc.save();
    await this.SyncProductInstances();
    this.RecomputeCatalogAndEmit();
    return doc;
  };

  BatchUpdateProductInstance = async (batches: UpdateProductInstanceProps[], suppress_catalog_recomputation: boolean = false): Promise<(IProductInstance | null)[]> => {
    logger.info(`Updating product instance(s) ${batches.map(x => `ID: ${x.piid}, changes: ${JSON.stringify(x.productInstance)}`).join(", ")}, ${suppress_catalog_recomputation ? "and suppressing the catalog recomputation" : ""}`);

    const oldProductInstances = batches.map(b => this.Catalog.productInstances[b.piid]!);
    const newExternalIdses = batches.map((b, i) => b.productInstance.externalIDs ?? oldProductInstances[i].externalIDs);
    const existingSquareExternalIds = newExternalIdses.map((ids) => GetSquareExternalIds(ids)).flat();
    let existingSquareObjects: CatalogObject[] = [];
    if (existingSquareExternalIds.length > 0) {
      const batchRetrieveCatalogObjectsResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(existingSquareExternalIds.map(x => x.value), false);
      if (!batchRetrieveCatalogObjectsResponse.success) {
        logger.error(`Getting current square CatalogObjects failed with ${JSON.stringify(batchRetrieveCatalogObjectsResponse.error)}`);
        return batches.map(_ => null);
      }
      existingSquareObjects = batchRetrieveCatalogObjectsResponse.result.objects ?? [];
    }

    const catalogObjects = batches.map((b, i) =>
      ProductInstanceToSquareCatalogObject(
        [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE],
        b.product,
        { ...oldProductInstances[i], ...b.productInstance },
        b.product.printerGroup ? this.#printerGroups[b.product.printerGroup] : null,
        this.CatalogSelectors, existingSquareObjects, ('000' + i).slice(-3)));
    const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects(catalogObjects.map(x => ({ objects: [x] })));
    if (!upsertResponse.success) {
      logger.error(`Failed to update square product, got errors: ${JSON.stringify(upsertResponse.error)}`);
      return batches.map(_ => null);
    }

    const mappings = upsertResponse.result.idMappings;

    const updated = await Promise.all(batches.map(async (b, i) => {
      const doc = await WProductInstanceModel
        .findByIdAndUpdate(b.piid,
          {
            ...b.productInstance,
            externalIDs: [...newExternalIdses[i], ...IdMappingsToExternalIds(mappings, ('000' + i).slice(-3))]
          }, { new: true })
        .exec();
      if (!doc) {
        return null;
      }
      return doc;
    }));

    if (!suppress_catalog_recomputation) {
      await this.SyncProductInstances();
      this.RecomputeCatalogAndEmit();
    }
    return updated;
  }

  UpdateProductInstance = async (props: UpdateProductInstanceProps, suppress_catalog_recomputation: boolean = false) => {
    return (await this.BatchUpdateProductInstance([props], suppress_catalog_recomputation))[0];
  };

  DeleteProductInstance = async (pi_id: string, suppress_catalog_recomputation: boolean = false) => {
    const instance = this.Catalog.productInstances[pi_id];
    if (instance) {
      const productEntry = this.Catalog.products[instance.productId];
      if (productEntry.product.baseProductId === pi_id) {
        logger.warn(`Attempted to delete base product instance for product ${productEntry.product.id}`);
        return null;
      }

      logger.debug(`Removing Product Instance: ${pi_id}`);
      const doc = await WProductInstanceModel.findByIdAndDelete(pi_id).exec();
      if (!doc) {
        return null;
      }

      await BatchDeleteCatalogObjectsFromExternalIds(doc.externalIDs);

      if (!suppress_catalog_recomputation) {
        await this.SyncProductInstances();
        this.RecomputeCatalogAndEmit();
      }
      return doc;
    }
    return null;
  }

  CreateProductInstanceFunction = async (productInstanceFunction: Omit<IProductInstanceFunction, 'id'>) => {
    const doc = new WProductInstanceFunctionModel(productInstanceFunction);
    await doc.save();
    await this.SyncProductInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return doc;
  };

  UpdateProductInstanceFunction = async (pif_id: string, productInstanceFunction: Omit<IProductInstanceFunction, 'id'>) => {
    const updated = await WProductInstanceFunctionModel
      .findByIdAndUpdate(pif_id, productInstanceFunction, { new: true }).exec();
    if (!updated) {
      return null;
    }
    await this.SyncProductInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return updated;
  };

  DeleteProductInstanceFunction = async (pif_id: string, suppress_catalog_recomputation = false) => {
    logger.debug(`Removing Product Instance Function: ${pif_id}`);
    const doc = await WProductInstanceFunctionModel.findByIdAndDelete(pif_id).exec();
    if (!doc) {
      return null;
    }
    const options_update = await WOptionModel.updateMany(
      { enable: pif_id },
      { $set: { "enable": null } }).exec();
    if (options_update.modifiedCount > 0) {
      logger.debug(`Removed ${doc} from ${options_update.modifiedCount} Modifier Options.`);
      await this.SyncOptions();
    }
    const products_update = await WProductModel.updateMany(
      { "modifiers.enable": pif_id },
      { $set: { "modifiers.$.enable": null } }).exec();
    if (products_update.modifiedCount > 0) {
      logger.debug(`Removed ${doc} from ${products_update.modifiedCount} Products.`);
      await this.SyncProducts();
    }

    await this.SyncProductInstanceFunctions();
    if (!suppress_catalog_recomputation) {
      this.RecomputeCatalogAndEmit();
    }
    return doc;
  }

  CreateOrderInstanceFunction = async (orderInstanceFunction: Omit<OrderInstanceFunction, 'id'>) => {
    const doc = new WOrderInstanceFunctionModel(orderInstanceFunction);
    await doc.save();
    await this.SyncOrderInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return doc;
  };

  UpdateOrderInstanceFunction = async (id: string, orderInstanceFunction: Partial<Omit<OrderInstanceFunction, 'id'>>) => {
    const updated = await WOrderInstanceFunctionModel.findByIdAndUpdate(id, orderInstanceFunction, { new: true });
    if (!updated) {
      return null;
    }
    await this.SyncOrderInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return updated;
  };

  DeleteOrderInstanceFunction = async (id: string, suppress_catalog_recomputation = false) => {
    logger.debug(`Removing Order Instance Function: ${id}`);
    const doc = await WOrderInstanceFunctionModel.findByIdAndDelete(id);
    if (!doc) {
      return null;
    }
    await this.SyncOrderInstanceFunctions();
    if (!suppress_catalog_recomputation) {
      this.RecomputeCatalogAndEmit();
    }
    return doc;
  }
}

export const CatalogProviderInstance = new CatalogProvider();
