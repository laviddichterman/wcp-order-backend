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
  PrinterGroup,
  IProductModifier,
  ProductModifierEntry,
  CreateIProductInstance,
  CreateProductBatch,
  UpdateIProduct,
  UpdateIProductUpdateIProductInstance,
  UpdateProductBatch,
  UpsertProductBatch
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
import { chunk } from 'lodash';
import { WProvider } from "../types/WProvider";
import { SquareProviderInstance, SQUARE_BATCH_CHUNK_SIZE } from "./square";
import { GenerateSquareReverseMapping, GetNonSquareExternalIds, GetSquareExternalIds, GetSquareIdIndexFromExternalIds, IdMappingsToExternalIds, ModifierTypeToSquareCatalogObject, PrinterGroupToSquareCatalogObjectPlusDummyProduct, ProductInstanceToSquareCatalogObject } from "./SquareWarioBridge";
import { CatalogIdMapping, CatalogObject } from "square";
import { FilterQuery } from "mongoose";
import { IsSetOfUniqueStrings } from "../utils";

function isUpdateProduct(batch: (CreateProductBatch | UpdateProductBatch)): batch is UpdateProductBatch {
  return (batch.product as UpdateIProduct).id !== undefined;
}
function isUpdateProductInstance(instance: (CreateIProductInstance | UpdateIProductUpdateIProductInstance)): instance is UpdateIProductUpdateIProductInstance {
  return (instance as UpdateIProductUpdateIProductInstance).id !== undefined;
}
const SUPPRESS_SQUARE_SYNC = process.env.WARIO_SUPPRESS_SQUARE_INIT_SYNC === '1' || process.env.WARIO_SUPPRESS_SQUARE_INIT_SYNC === 'true';
const FORCE_SQUARE_CATALOG_REBUILD_ON_LOAD = process.env.WARIO_FORCE_SQUARE_CATALOG_REBUILD_ON_LOAD === '1' || process.env.WARIO_SUPPRESS_SQUARE_INIT_SYNC === 'true';

/** checks that all passed categories, modifiers, functions, printer group ids exist */
const ValidateProductModifiersFunctionsCategoriesPrinterGroups = function (modifiers: { mtid: string; enable: string | null; }[], category_ids: string[], printer_group_ids: string[], catalog: CatalogProvider) {
  const found_all_modifiers = modifiers.map(entry =>
    catalog.ModifierTypes.some(x => x.id === entry.mtid) &&
    (entry.enable === null || Object.hasOwn(catalog.ProductInstanceFunctions, entry.enable))).every(x => x === true);
  const found_all_categories = category_ids.map(cid => Object.hasOwn(catalog.Categories, cid)).every(x => x === true);
  const found_all_printer_groups = printer_group_ids.map(pgid => Object.hasOwn(catalog.PrinterGroups, pgid)).every(x => x === true);
  return found_all_categories && found_all_modifiers && found_all_printer_groups;
}

/**
 * Merges the original and updated external IDs into a single array, making sure to preserve the original Square external IDs.
 * 
 * @param originalExternalIds - The original external IDs, potentially containing the square external IDs.
 * @param updateExternalIds - The updated external IDs, with any SquareIDs removed already.
 * @returns The merged array of external IDs.
 */
export const ProductInstanceUpdateMergeExternalIds = (originalExternalIds: KeyValue[] | undefined, updateExternalIds: KeyValue[] | undefined) => {
  if (updateExternalIds && originalExternalIds) {
    const squareExternalIds = GetSquareExternalIds(originalExternalIds);
    const updateSquareExternalIds = updateExternalIds;
    return [...squareExternalIds, ...updateSquareExternalIds];
  }
  return updateExternalIds ?? originalExternalIds ?? [];
}

/**
 * checks that a passed instance doesn't explicitly declare a modifier that isn't allowed
 * TODO: move this to WCPShared 
 */
const ValidateModifiersForInstance = function (productModifierSpecification: IProductModifier[], instanceModifierSpecification: ProductModifierEntry[]) {
  const mtidsInInstanceSpec = new Set(...instanceModifierSpecification.map((x) => x.modifierTypeId));
  const mtidsInProductSpec = new Set(...productModifierSpecification.map(x => x.mtid));
  return new Array(...mtidsInInstanceSpec).filter(x => !mtidsInProductSpec.has(x)).length === 0;
}

const LocationsConsidering3pFlag = (is3p: boolean) => [
  DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE,
  ...(is3p && DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P ? [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P] : [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION])
];


const BatchDeleteCatalogObjectsFromExternalIds = async (externalIds: KeyValue[]) => {
  const squareKV = GetSquareExternalIds(externalIds);
  if (squareKV.length > 0) {
    logger.debug(`Removing from square... ${squareKV.map(x => `${x.key}: ${x.value}`).join(", ")}`);
    return await SquareProviderInstance.BatchDeleteCatalogObjects(squareKV.map(x => x.value));
  }
  return true;
}

type UpdateProductInstanceProps = {
  piid: string;
  product: Pick<IProduct, 'price' | 'modifiers' | 'printerGroup' | 'disabled' | 'displayFlags'>;
  productInstance: Partial<Omit<IProductInstance, 'id' | 'productId'>>;
};

type UpdateModifierTypeProps = {
  id: string;
  modifierType: Partial<Omit<IOptionType, 'id'>>;
}

type UpdatePrinterGroupProps = {
  id: string;
  printerGroup: Partial<Omit<PrinterGroup, 'id'>>;
};

type UpdateModifierOptionProps = {
  id: string;
  modifierTypeId: string;
  modifierOption: Partial<Omit<IOption, 'id' | 'modifierTypeId'>>;
};
export type UncommitedOption = Omit<IOption, 'modifierTypeId' | 'id'>;
export type UpsertOption = (Partial<UncommitedOption> & Pick<IOption, 'id'>) | UncommitedOption;
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
  #squareIdToWarioIdMapping: Record<string, string>;
  #apiver: SEMVER;
  #requireSquareRebuild: boolean;
  constructor() {
    this.#apiver = { major: 0, minor: 0, patch: 0 };
    this.#requireSquareRebuild = FORCE_SQUARE_CATALOG_REBUILD_ON_LOAD === true;
    this.#squareIdToWarioIdMapping = {};
  }

  set RequireSquareRebuild(value: boolean) {
    this.#requireSquareRebuild = value;
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

  get ReverseMappings(): Readonly<Record<string, string>> {
    return this.#squareIdToWarioIdMapping;
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
    this.#squareIdToWarioIdMapping = GenerateSquareReverseMapping(this.#catalog);
  }

  RecomputeCatalogAndEmit = () => {
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
  }

  private CheckAllPrinterGroupsSquareIdsAndFixIfNeeded = async () => {
    const squareCatalogObjectIds = Object.values(this.#printerGroups)
      .map(printerGroup => GetSquareExternalIds(printerGroup.externalIDs).map(x => x.value)).flat();
    if (squareCatalogObjectIds.length > 0) {
      const catalogObjectResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(squareCatalogObjectIds, false);
      if (catalogObjectResponse.success) {
        const foundObjects = catalogObjectResponse.result.objects!;
        const missingSquareCatalogObjectBatches: UpdatePrinterGroupProps[] = [];
        Object.values(this.#printerGroups)
          .forEach(x => {
            const missingIDs = GetSquareExternalIds(x.externalIDs).filter(kv => foundObjects.findIndex(o => o.id === kv.value) === -1);
            if (missingIDs.length > 0) {
              missingSquareCatalogObjectBatches.push({
                id: x.id,
                printerGroup: { externalIDs: x.externalIDs.filter(kv => missingIDs.findIndex(idKV => idKV.value === kv.value) === -1) }
              });
            }
          });
        if (missingSquareCatalogObjectBatches.length > 0) {
          await this.BatchUpdatePrinterGroup(missingSquareCatalogObjectBatches);
        }
      }
    }
    const batches = Object.values(this.#printerGroups)
      .filter(pg => GetSquareIdIndexFromExternalIds(pg.externalIDs, 'CATEGORY') === -1 ||
        GetSquareIdIndexFromExternalIds(pg.externalIDs, 'ITEM') === -1 ||
        GetSquareIdIndexFromExternalIds(pg.externalIDs, 'ITEM_VARIATION') === -1)
      .map(pg => ({ id: pg.id, printerGroup: {} }));
    return batches.length > 0 ? await this.BatchUpdatePrinterGroup(batches) : null;
  }

  private CheckAllModifierTypesHaveSquareIdsAndFixIfNeeded = async () => {
    const updatedModifierTypeIds: string[] = [];
    const squareCatalogObjectIds = Object.values(this.Catalog.modifiers)
      .map(modifierTypeEntry => GetSquareExternalIds(modifierTypeEntry.modifierType.externalIDs).map(x => x.value)).flat();
    if (squareCatalogObjectIds.length > 0) {
      const catalogObjectResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(squareCatalogObjectIds, false);
      if (catalogObjectResponse.success) {
        const foundObjects = catalogObjectResponse.result.objects!;
        const missingSquareCatalogObjectBatches: UpdateModifierTypeProps[] = [];
        const optionUpdates: { id: string; externalIDs: KeyValue[]; }[] = [];
        Object.values(this.Catalog.modifiers)
          .filter(x =>
            GetSquareExternalIds(x.modifierType.externalIDs).reduce((acc, kv) => acc || foundObjects.findIndex(o => o.id === kv.value) === -1, false))
          .forEach((x) => {
            missingSquareCatalogObjectBatches.push({
              id: x.modifierType.id,
              modifierType: { externalIDs: GetNonSquareExternalIds(x.modifierType.externalIDs) }
            });
            logger.info(`Pruning square catalog IDs from options: ${x.options.join(", ")}`);
            optionUpdates.push(...x.options.map(oId => ({ id: oId, externalIDs: GetNonSquareExternalIds(this.Catalog.options[oId]!.externalIDs) })))
          });
        if (missingSquareCatalogObjectBatches.length > 0) {
          // logger.info(`DEBUG PRINTING: ${JSON.stringify(missingSquareCatalogObjectBatches)}`);
          // @ts-ignore
          const bulkWriteResult = await WOptionModel.bulkWrite(optionUpdates.map(o => ({
            updateOne: {
              filter: { _id: o.id },
              update: { externalIDs: o.externalIDs },
              upsert: true
            }
          })));
          logger.info(`Bulk upsert of WOptionModel successful: ${JSON.stringify(bulkWriteResult)}`);
          await this.SyncOptions();
          this.RecomputeCatalog();
          const updated = await this.BatchUpdateModifierType(missingSquareCatalogObjectBatches, true, false);
          updatedModifierTypeIds.push(...updated.filter(x => x !== null).map(x => x!.id));
          this.RecomputeCatalog();
        }
      }
    }
    const missingSquareIdBatches = Object.values(this.Catalog.modifiers)
      .filter(x =>
        GetSquareIdIndexFromExternalIds(x.modifierType.externalIDs, 'MODIFIER_LIST') === -1 ||
        x.options.reduce((acc, oId) => acc || GetSquareIdIndexFromExternalIds(this.Catalog.options[oId]!.externalIDs, 'MODIFIER_WHOLE') === -1, false))
      .map(x => ({ id: x.modifierType.id, modifierType: {} }));
    if (missingSquareIdBatches.length > 0) {
      updatedModifierTypeIds.push(...(await this.BatchUpdateModifierType(missingSquareIdBatches, true, false)).filter(x => x !== null).map(x => x!.id))
    }
    return updatedModifierTypeIds;
  }

  CheckAllProductsHaveSquareIdsAndFixIfNeeded = async () => {
    const squareCatalogObjectIds = Object.values(this.#catalog.products)
      .map(p => p.instances.map(piid => GetSquareExternalIds(this.#catalog.productInstances[piid]!.externalIDs).map(x => x.value)).flat()).flat();
    if (squareCatalogObjectIds.length > 0) {
      const catalogObjectResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(squareCatalogObjectIds, false);
      if (catalogObjectResponse.success) {
        const foundObjects = catalogObjectResponse.result.objects!;
        const missingSquareCatalogObjectBatches = Object.values(this.#catalog.products)
          .map(p => p.instances
            .filter(x => GetSquareExternalIds(this.#catalog.productInstances[x]!.externalIDs).reduce((acc, kv) => acc || foundObjects.findIndex(o => o.id === kv.value) === -1, false))
            .map(piid => ({ piid, product: { modifiers: p.product.modifiers, price: p.product.price, printerGroup: p.product.printerGroup, disabled: p.product.disabled, displayFlags: p.product.displayFlags }, productInstance: { externalIDs: GetNonSquareExternalIds(this.#catalog.productInstances[piid]!.externalIDs) } })))
          .flat();
        if (missingSquareCatalogObjectBatches.length > 0) {
          await this.BatchUpdateProductInstance(missingSquareCatalogObjectBatches, true);
          await this.SyncProductInstances();
          this.RecomputeCatalog();
        }
      }
    }

    const batches = Object.values(this.#catalog.products)
      .map(p => p.instances
        .filter(piid => { const pi = this.#catalog.productInstances[piid]; return pi && pi.displayFlags.hideFromPos !== true && GetSquareIdIndexFromExternalIds(pi.externalIDs, "ITEM") === -1; })
        .map(piid => ({ piid, product: { modifiers: p.product.modifiers, price: p.product.price, printerGroup: p.product.printerGroup, disabled: p.product.disabled, displayFlags: p.product.displayFlags }, productInstance: {} })))
      .flat();
    if (batches.length > 0) {
      await this.BatchUpdateProductInstance(batches, true);
      await this.SyncProductInstances();
      this.RecomputeCatalog();
    }
  }

  ForceSquareCatalogCompleteUpsert = async () => {
    const printerGroupUpdates = Object.values(this.#printerGroups).map(pg => ({ id: pg.id, printerGroup: {} }));
    await this.BatchUpdatePrinterGroup(printerGroupUpdates);
    const modifierTypeUpdates = Object.values(this.Catalog.modifiers).map(x => ({ id: x.modifierType.id, modifierType: {} }));
    await this.BatchUpdateModifierType(modifierTypeUpdates, true, true);
    this.SyncModifierTypes();
    this.SyncOptions();
    this.SyncProductInstances();
    this.SyncProducts();
    this.RecomputeCatalog();

    await this.UpdateProductsWithConstraint({}, {}, true);
    this.SyncModifierTypes();
    this.SyncOptions();
    this.SyncProductInstances();
    this.SyncProducts();
    this.RecomputeCatalog();
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

    if (SUPPRESS_SQUARE_SYNC) {
      logger.warn("Suppressing Square Catalog Sync at launch. Catalog skew may result.")
    } else {
      await this.CheckAllPrinterGroupsSquareIdsAndFixIfNeeded();
      const modifierTypeIdsUpdated = await this.CheckAllModifierTypesHaveSquareIdsAndFixIfNeeded();
      this.RecomputeCatalog();
      await this.CheckAllProductsHaveSquareIdsAndFixIfNeeded();
      if (modifierTypeIdsUpdated.length > 0) {
        logger.info(`Going back and updating product instances impacted by earlier CheckAllModifierTypesHaveSquareIdsAndFixIfNeeded call, for ${modifierTypeIdsUpdated.length} modifier types`)
        await this.UpdateProductsReferencingModifierTypeId(modifierTypeIdsUpdated);
      }
    }

    if (this.#requireSquareRebuild === true) {
      logger.info('Forcing Square catalog rebuild on load');
      await this.ForceSquareCatalogCompleteUpsert();
    }

    logger.info(`Finished Bootstrap of CatalogProvider`);
  };

  CreatePrinterGroup = async (printerGroup: Omit<PrinterGroup, "id">) => {
    logger.info(`Creating Printer Group: ${JSON.stringify(printerGroup)}`);
    const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects([{
      objects: PrinterGroupToSquareCatalogObjectPlusDummyProduct(
        [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE], // this ONLY goes to the alternate location since we can't purchase messages
        printerGroup,
        [],
        "")
    }]);
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
    return doc.toObject();
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
        [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE], // message only needs to go to the alternate location
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
      return doc.toObject();
    }));

    this.SyncPrinterGroups();
    return updated;
  }

  UpdatePrinterGroup = async (props: UpdatePrinterGroupProps) => {
    return (await this.BatchUpdatePrinterGroup([props]))[0];
  };

  DeletePrinterGroup = async (id: string, reassign: boolean, destinationPgId: string | null) => {
    logger.debug(`Removing Printer Group ${id}`);
    const doc = await PrinterGroupModel.findByIdAndDelete(id).exec();
    if (!doc) {
      return null;
    }

    // NOTE: this removes the category from the Square ITEMs as well
    await BatchDeleteCatalogObjectsFromExternalIds(doc.externalIDs);

    await this.SyncPrinterGroups();

    // needs to write batch update product
    await this.UpdateProductsWithConstraint({ 'printerGroup': id }, { printerGroup: reassign ? destinationPgId : null }, false)
    return doc.toObject();
  }

  CreateCategory = async (category: Omit<ICategory, "id">) => {
    const doc = new WCategoryModel(category);
    await doc.save();
    await this.SyncCategories();
    this.RecomputeCatalog();
    SocketIoProviderInstance.EmitCatalog(this.#catalog);
    return doc.toObject();
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
        cycle_update_promise = WCategoryModel.findByIdAndUpdate(cur, { parent_id: null }, { new: true }).exec();
      }
    }
    const response = await WCategoryModel.findByIdAndUpdate(category_id, category, { new: true }).exec();
    if (cycle_update_promise) {
      await cycle_update_promise;
    }
    await this.SyncCategories();
    this.RecomputeCatalogAndEmit();
    // is this going to still be valid after the Sync above?
    return response!.toObject();
  };

  DeleteCategory = async (category_id: string, delete_contained_products: boolean) => {
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
        await WCategoryModel.findByIdAndUpdate(cat.id, { parent_id: null }, { new: true }).exec();
      }
    }));
    if (delete_contained_products) {
      await this.BatchDeleteProduct(this.#catalog.categories[category_id]!.products, true);
    }
    else {
      const products_update = await WProductModel.updateMany({}, { $pull: { category_ids: category_id } }).exec();
      if (products_update.modifiedCount > 0) {
        logger.debug(`Removed Category ID from ${products_update.modifiedCount} products.`);
        await this.SyncProducts();
      }
    }
    await this.SyncCategories();
    this.RecomputeCatalogAndEmit();
    return doc.toObject();
  }

  CreateModifierType = async (modifierType: Omit<IOptionType, "id">, modifierOptions: UncommitedOption[]) => {
    modifierOptions.forEach(opt => {
      if (!this.ValidateOption(modifierType, opt)) {
        throw 'Failed validation on modifier option in a single select modifier type';
      }
    })
    const doc = new WOptionTypeModel({ ...modifierType, externalIDs: GetNonSquareExternalIds(modifierType.externalIDs) });
    await doc.save();
    const modifierTypeId = doc.id;
    await this.SyncModifierTypes();
    if (modifierOptions.length > 0) {

      // we need to filter these external IDs because it'll interfere with adding the new modifier to the catalog
      const adjustedOptions: Omit<IOption, 'id'>[] = modifierOptions.map(opt => ({ ...opt, modifierTypeId, externalIDs: GetNonSquareExternalIds(opt.externalIDs) })).sort((a, b) => a.ordinal - b.ordinal);
      const optionDocuments = adjustedOptions.map(x => new WOptionModel(x));
      // add the new option to the db, sync and recompute the catalog, then use UpdateModifierType to clean up
      const bulkWriteResult = await WOptionModel.bulkWrite(optionDocuments.map(o => ({
        insertOne: {
          document: o
        }
      })));
      await this.SyncOptions();
      this.RecomputeCatalog();
      await this.UpdateModifierType({ id: modifierTypeId, modifierType: {} });
    }
    this.RecomputeCatalogAndEmit();
    return doc.toObject();
  };

  private UpdateProductsReferencingModifierTypeId = async (modifierTypeIds: string[]) => {
    // add the modifier to all items that reference this modifier option's modifierTypeId
    const productUpdates = Object.values(this.#catalog.products)
      .filter(p => p.product.modifiers.findIndex(x => modifierTypeIds.findIndex(y => y === x.mtid) !== -1) !== -1)
      .map((p) => p.instances.map(piid => ({
        piid,
        product: { modifiers: p.product.modifiers, price: p.product.price, printerGroup: p.product.printerGroup, disabled: p.product.disabled, displayFlags: p.product.displayFlags },
        productInstance: {}
      }))).flat();
    if (productUpdates.length > 0) {
      await this.BatchUpdateProductInstance(productUpdates, true);
      // explicitly don't need to sync the product instances here since we're just making this batch call for square product updates
    }
  }

  private UpdateProductsWithConstraint = async (testProduct: FilterQuery<IProduct>, updateProduct: Partial<Pick<IProduct, 'price' | 'modifiers' | 'printerGroup'>>, suppress_catalog_recomputation: boolean) => {
    // add the modifier to all items that reference this modifier option's modifierTypeId
    const products = await WProductModel.find(testProduct).exec();
    const instanceUpdates = (await Promise.all(products.map(async (p) => {
      const instances = await WProductInstanceModel.find({ productId: p.id }).exec();
      return instances.map(i => ({ piid: i.id, product: { ...{ price: p.price, modifiers: p.modifiers, printerGroup: p.printerGroup, disabled: p.disabled, displayFlags: p.displayFlags }, ...updateProduct }, productInstance: {} }));
    }))).flat();
    if (instanceUpdates.length > 0) {
      await WProductModel.updateMany(testProduct, updateProduct);
      if (!suppress_catalog_recomputation) {
        await this.SyncProducts();
      }
      await this.BatchUpdateProductInstance(instanceUpdates, suppress_catalog_recomputation);
    }
  }

  /**
   * 
   * @param batches 
   * @param suppressFullRecomputation flag to turn off product instance recomputation and catalog emit. needed for bootstrapping
   * @returns 
   */
  BatchUpdateModifierType = async (batches: UpdateModifierTypeProps[], suppressFullRecomputation: boolean, forceDeepUpsert: boolean) => {
    const externalIdsToPullFromForSquareCatalogDeletion: KeyValue[] = [];
    const externalIdsToFetchFromSquare: string[] = [];
    const batchData = batches.map((b) => {
      const existingModifierTypeEntry = this.#catalog.modifiers[b.id]!;
      const existingModifierType = existingModifierTypeEntry.modifierType;
      const existingOptions = existingModifierTypeEntry.options.map(o => this.#catalog.options[o]!).sort((a, b) => a.ordinal - b.ordinal);
      const updatedModifierType = { ...existingModifierType, ...b.modifierType };
      let updatedOptions = existingOptions.slice();

      const modifierTypeSquareExternalIds = GetSquareExternalIds(existingModifierType.externalIDs);
      const existingOptionsHave_MODIFIER_WHOLE = existingOptions.reduce((acc, x) => acc && GetSquareIdIndexFromExternalIds(x.externalIDs, 'MODIFIER_WHOLE') !== -1, true)
      const missingSquareCatalogObjects = !existingOptionsHave_MODIFIER_WHOLE || modifierTypeSquareExternalIds.length === 0;
      const ordinalIsChanging = updatedModifierType.ordinal !== existingModifierType.ordinal;
      const is3pChanging = updatedModifierType.displayFlags.is3p !== existingModifierType.displayFlags.is3p;
      const nameAttributeIsChanging = (updatedModifierType.name !== existingModifierType.name || updatedModifierType.displayName !== existingModifierType.displayName);
      const otsOrSplitAllowingOptions = existingOptions.filter(x => x.metadata.allowOTS || x.metadata.can_split).length > 0;
      let deepUpdate = false;
      let updateModifierOptionsAndProducts = false;
      if (updatedModifierType.max_selected === 1 && otsOrSplitAllowingOptions) {
        const errorDetail = 'Unable to transition modifiers to single select as some modifier options have split or OTS enabled.';
        logger.warn(errorDetail);
        throw errorDetail;
      }
      // we need to do some deep updates if...
      // * final modifier options length > 0
      // * AND ...
      //    * is3pChanging
      //    * ordinalIsChanging
      //    * nameAttributeIsChanging
      //    * selection type is changing (switchingSelectionType)
      //    * or if the MT or MOs are missing external IDs (missingSquareCatalogObjects)
      if (updatedOptions.length > 0 && (forceDeepUpsert || is3pChanging || ordinalIsChanging || nameAttributeIsChanging || missingSquareCatalogObjects)) {
        if (missingSquareCatalogObjects || forceDeepUpsert) {
          // make sure all square external IDs are removed from the new external IDs for the MT, because the externalIds might be explicitly updated here
          updatedModifierType.externalIDs = GetNonSquareExternalIds(updatedModifierType.externalIDs);

          // add the square catalog objects to the list of catalog objects to nuke
          externalIdsToPullFromForSquareCatalogDeletion.push(...modifierTypeSquareExternalIds,
            ...updatedOptions.map(x => x.externalIDs).flat())

          // nuke the IDs from the modifier options we be clobbering
          updatedOptions = updatedOptions.map((x) => ({ ...x, externalIDs: GetNonSquareExternalIds(x.externalIDs) }));
          deepUpdate = true;
        }
        updateModifierOptionsAndProducts = true;
      }
      if (updateModifierOptionsAndProducts || deepUpdate) {
        // because we allow overriding the deepUpdate via forceDeepUpsert, we need to get any relevant external IDs outside of where deepUpdate = true is set above.
        externalIdsToFetchFromSquare.push(...GetSquareExternalIds([...updatedModifierType.externalIDs, ...updatedOptions.map(x => x.externalIDs).flat()]).map(x => x.value))
      }
      return {
        deepUpdate,
        updateModifierOptionsAndProducts,
        updatedOptions,
        updatedModifierType,
      };
    });
    // nuke relevant IDs
    await BatchDeleteCatalogObjectsFromExternalIds(externalIdsToPullFromForSquareCatalogDeletion);

    let existingSquareObjects: CatalogObject[] = [];
    if (externalIdsToFetchFromSquare.length > 0) {
      const batchRetrieveCatalogObjectsResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(externalIdsToFetchFromSquare, false);
      if (!batchRetrieveCatalogObjectsResponse.success) {
        const errorDetail = `Getting current square CatalogObjects failed with ${JSON.stringify(batchRetrieveCatalogObjectsResponse.error)}`;
        logger.error(errorDetail);
        throw errorDetail;
      }
      existingSquareObjects = batchRetrieveCatalogObjectsResponse.result.objects ?? [];
    }

    const mappings: CatalogIdMapping[] = [];
    const catalogObjectsToUpsert: CatalogObject[] = [];
    batchData.map((batch, batchId) => {
      if (batch.updateModifierOptionsAndProducts) {
        catalogObjectsToUpsert.push(ModifierTypeToSquareCatalogObject(
          LocationsConsidering3pFlag(batch.updatedModifierType.displayFlags.is3p),
          batch.updatedModifierType,
          batch.updatedOptions,
          existingSquareObjects,
          ('000' + batchId).slice(-3)));
      }
    })
    if (catalogObjectsToUpsert.length > 0) {
      const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects(chunk(catalogObjectsToUpsert, SQUARE_BATCH_CHUNK_SIZE).map(x => ({ objects: x })));
      if (!upsertResponse.success) {
        const errorDetail = `Failed to update square modifier options, got errors: ${JSON.stringify(upsertResponse.error)}`;
        logger.error(errorDetail);
        throw errorDetail;
      }
      mappings.push(...(upsertResponse.result.idMappings ?? []));
    }

    const updatedWarioObjects = batchData.map((batch, batchId) => {
      return {
        modifierType: {
          ...batch.updatedModifierType,
          externalIDs: [...batch.updatedModifierType.externalIDs, ...IdMappingsToExternalIds(mappings, ('000' + batchId).slice(-3))]
        },
        options: batch.updatedOptions.map((opt, i) => ({
          ...opt,
          externalIDs: [...opt.externalIDs, ...IdMappingsToExternalIds(mappings, `${('000' + batchId).slice(-3)}S${('000' + i).slice(-3)}S`)]
        }))
      };
    });

    // await WOptionModel.bulkWrite(updatedWarioObjects.flatMap(b => b.options).map(o => ({
    //   updateOne: {
    //     filter: { id: o.id },
    //     update: o,
    //     upsert: true
    //   }
    // }))).then((result) => logger.info(`Bulk upsert of WOptionModel successful: ${JSON.stringify(result)}`));
    const updatedModifierOptions = await Promise.all(updatedWarioObjects.flatMap(b => b.options).map(async (b) => {
      return (await WOptionModel.findByIdAndUpdate(b.id,
        b,
        { new: true }))?.toObject() ?? null;
    }));

    const updatedModifierTypes = await Promise.all(updatedWarioObjects.map(async (b) => {
      return (await WOptionTypeModel.findByIdAndUpdate(b.modifierType.id,
        b.modifierType,
        { new: true }))?.toObject() ?? null;
    }));

    await this.SyncModifierTypes();
    await this.SyncOptions();

    if (!suppressFullRecomputation) {
      this.RecomputeCatalog();
      await this.UpdateProductsReferencingModifierTypeId(batchData.filter(x => x.updateModifierOptionsAndProducts).map(x => x.updatedModifierType.id));
      await this.SyncProductInstances();

      this.RecomputeCatalogAndEmit();
    }
    return updatedModifierTypes;
  }

  UpdateModifierType = async (props: UpdateModifierTypeProps) => {
    return (await this.BatchUpdateModifierType([props], false, false))[0];
  };

  DeleteModifierType = async (mt_id: string) => {
    logger.debug(`Removing Modifier Type: ${mt_id}`);
    const doc = await WOptionTypeModel.findByIdAndDelete(mt_id).exec();
    if (!doc) {
      logger.warn("Unable to delete the ModifierType from the database.");
      return null;
    }
    const modifierTypeEntry = this.#catalog.modifiers[mt_id];

    // if there are any square ids associated with this modifier type then we delete them first
    await BatchDeleteCatalogObjectsFromExternalIds(modifierTypeEntry.modifierType.externalIDs);

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
    return doc.toObject();
  }

  ValidateOption = (modifierType: Pick<IOptionType, 'max_selected'>,
    modifierOption: Partial<UncommitedOption>) => {
    if (modifierType.max_selected === 1) {
      return !modifierOption.metadata || (modifierOption.metadata.allowOTS === false && modifierOption.metadata.can_split === false);
    }
    return true;
  }

  CreateOption = async (modifierOption: Omit<IOption, 'id'>) => {
    // first find the Modifier Type ID in the catalog
    if (!Object.hasOwn(this.Catalog.modifiers, modifierOption.modifierTypeId)) {
      return null;
    }

    const modifierTypeEntry = this.Catalog.modifiers[modifierOption.modifierTypeId];
    if (!this.ValidateOption(modifierTypeEntry.modifierType, modifierOption)) {
      throw 'Failed validation on modifier option in a single select modifier type';
    }

    // we need to filter these external IDs because it'll interfere with adding the new modifier to the catalog
    const filteredExternalIds = GetNonSquareExternalIds(modifierOption.externalIDs);
    const adjustedOption: Omit<IOption, 'id'> = { ...modifierOption, externalIDs: filteredExternalIds };

    // add the new option to the db, sync and recompute the catalog, then use UpdateModifierType to clean up
    const doc = new WOptionModel(adjustedOption);
    await doc.save();
    await this.SyncOptions();
    this.RecomputeCatalog();
    await this.UpdateModifierType({ id: modifierOption.modifierTypeId, modifierType: {} });
    await this.RecomputeCatalogAndEmit();
    // since we have new external IDs, we need to pull the modifier option from the catalog after the above syncing
    return this.Catalog.options[doc.id]!;
  };

  UpdateModifierOption = async (props: UpdateModifierOptionProps) => {
    return (await this.BatchUpdateModifierOption([props]))[0];
  };

  BatchUpdateModifierOption = async (batches: UpdateModifierOptionProps[]) => {
    logger.info(`Request to update ModifierOption(s) ${batches.map(b => `ID: ${b.id}, updates: ${JSON.stringify(b.modifierOption)}`).join(", ")}`);
    if (!IsSetOfUniqueStrings(batches.map(b => b.modifierTypeId))) {
      // Note: this checks for duplicate modifier types in the batches, but at some point the thought was that we couldn't be updating two single select modifier options in the same type. 
      // If the next error fails too many cases, revisit the scope of the check on the next line.
      const errorDetail = `Request for multiple option update batches from the same modifier type.`;
      logger.error(errorDetail);
      throw errorDetail;
    }
    const batchesInfo = batches.map((b, i) => {
      const oldOption = this.#catalog.options[b.id]!;
      return {
        batch: b,
        oldOption,
        modifierTypeEntry: this.#catalog.modifiers[b.modifierTypeId]!,
        updatedOption: { ...oldOption, ...b.modifierOption }
      };
    });

    const squareCatalogObjectsToDelete: string[] = [];
    const existingSquareExternalIds: string[] = [];
    batchesInfo.forEach((b, i) => {
      if (!this.ValidateOption(b.modifierTypeEntry.modifierType, b.updatedOption)) {
        const errorDetail = `Failed validation on modifier option ${JSON.stringify(b.updatedOption)} in a single select modifier type.`;
        logger.error(errorDetail);
        throw errorDetail;
      }
      if (b.batch.modifierOption.metadata) {
        if (b.batch.modifierOption.metadata.allowHeavy === false && b.oldOption.metadata.allowHeavy === true) {
          const kv = b.updatedOption.externalIDs.splice(GetSquareIdIndexFromExternalIds(b.updatedOption.externalIDs, 'MODIFIER_HEAVY'), 1)[0];
          squareCatalogObjectsToDelete.push(kv.value);
        }
        if (b.batch.modifierOption.metadata.allowLite === false && b.oldOption.metadata.allowLite === true) {
          const kv = b.updatedOption.externalIDs.splice(GetSquareIdIndexFromExternalIds(b.updatedOption.externalIDs, 'MODIFIER_LITE'), 1)[0];
          squareCatalogObjectsToDelete.push(kv.value);
        }
        if (b.batch.modifierOption.metadata.allowOTS === false && b.oldOption.metadata.allowOTS === true) {
          const kv = b.updatedOption.externalIDs.splice(GetSquareIdIndexFromExternalIds(b.updatedOption.externalIDs, 'MODIFIER_OTS'), 1)[0];
          squareCatalogObjectsToDelete.push(kv.value);
        }
        if (b.batch.modifierOption.metadata.can_split === false && b.oldOption.metadata.can_split === true) {
          const kvL = b.updatedOption.externalIDs.splice(GetSquareIdIndexFromExternalIds(b.updatedOption.externalIDs, 'MODIFIER_LEFT'), 1)[0];
          const kvR = b.updatedOption.externalIDs.splice(GetSquareIdIndexFromExternalIds(b.updatedOption.externalIDs, 'MODIFIER_RIGHT'), 1)[0];
          squareCatalogObjectsToDelete.push(kvL.value, kvR.value);
        }
      }
      existingSquareExternalIds.push(...GetSquareExternalIds(b.modifierTypeEntry.modifierType.externalIDs).map(x => x.value));
      existingSquareExternalIds.push(...b.modifierTypeEntry.options.filter(x => x !== b.batch.id).flatMap(oId => GetSquareExternalIds(this.Catalog.options[oId]!.externalIDs)).map(x => x.value));
      existingSquareExternalIds.push(...GetSquareExternalIds(b.updatedOption.externalIDs).map(x => x.value))
    })

    if (squareCatalogObjectsToDelete.length > 0) {
      logger.info(`Deleting Square Catalog Modifiers due to ModifierOption update: ${squareCatalogObjectsToDelete.join(', ')}`);
      await SquareProviderInstance.BatchDeleteCatalogObjects(squareCatalogObjectsToDelete);
    }
    let existingSquareObjects: CatalogObject[] = [];
    if (existingSquareExternalIds.length > 0) {
      const batchRetrieveCatalogObjectsResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(existingSquareExternalIds, false);
      if (!batchRetrieveCatalogObjectsResponse.success) {
        logger.error(`Getting current square CatalogObjects failed with ${JSON.stringify(batchRetrieveCatalogObjectsResponse.error)}`);
        return batches.map(_ => null);
      }
      existingSquareObjects = batchRetrieveCatalogObjectsResponse.result.objects ?? [];
    }
    const catalogObjectsForUpsert: CatalogObject[] = [];
    batchesInfo.forEach((b, i) => {
      const options = b.modifierTypeEntry.options.map(oId => (oId === b.batch.id ? b.updatedOption : this.Catalog.options[oId]!))
      catalogObjectsForUpsert.push(ModifierTypeToSquareCatalogObject(
        LocationsConsidering3pFlag(b.modifierTypeEntry.modifierType.displayFlags.is3p),
        b.modifierTypeEntry.modifierType,
        options,
        existingSquareObjects,
        ('000' + i).slice(-3)));
    });

    let mappings: CatalogIdMapping[] | undefined;

    if (catalogObjectsForUpsert.length > 0) {
      const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects(chunk(catalogObjectsForUpsert, SQUARE_BATCH_CHUNK_SIZE).map(x => ({ objects: x })));
      if (!upsertResponse.success) {
        logger.error(`Failed to update square modifiers, got errors: ${JSON.stringify(upsertResponse.error)}`);
        return batches.map(_ => null);
      }
      mappings = upsertResponse.result.idMappings;
    }

    const updated = await Promise.all(batchesInfo.map(async (b, i) => {
      const doc = await WOptionModel.findByIdAndUpdate(
        b.batch.id,
        {
          ...b.batch.modifierOption,
          externalIDs: [...b.updatedOption.externalIDs, ...IdMappingsToExternalIds(mappings, ('000' + i).slice(-3))]
        }, { new: true })
        .exec();
      if (!doc) {
        return null;
      }
      return doc.toObject();
    }));

    const updatedOptions = batchesInfo.map(x => x.batch.id);
    // After we've updated the modifiers, we need to rebuild all products with the said modifier option(s) since the ordinal and price might have changed
    // TODO: verify we don't need to update products that could add that modifier too, like any product class with the modifier type enabled on it
    const product_instances_to_update = await WProductInstanceModel.find(
      { "modifiers.options": { $elemMatch: { "optionId": { $in: updatedOptions } } } }).exec();
    product_instances_to_update.map(x => x.id)
    const batchProductInstanceUpdates = product_instances_to_update.map((pi) => ({
      piid: pi.id,
      product: this.#catalog.products[pi.productId]!.product,
      productInstance: {
        modifiers: pi.modifiers
      }
    }));

    await this.SyncOptions();
    if (batchProductInstanceUpdates.length > 0) {
      this.RecomputeCatalog();
      await this.BatchUpdateProductInstance(batchProductInstanceUpdates, true);
      await this.SyncProductInstances();
    }

    this.RecomputeCatalogAndEmit();

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
    return doc.toObject();
  }

  CreateProduct = async (product: Omit<IProduct, 'id' | 'baseProductId'>, instances: Omit<IProductInstance, 'id' | 'productId'>[]) => {
    const result = await this.BatchUpsertProduct([{ product: product, instances }]);
    return result ? result[0] : null;
  };

  /**
   * Upsert of multiple products classes and their instances. 
   * an IProduct to update can only appear once in a set of batches
   * an IProductInstance being updated must belong to its parent IProduct
   * an IProductInstance being updated must only appear once in the instances array
   * If any of these preconditions are not met, the whole batch operation is rejected 
   * NOTE: UNSUPPORTED doing an update which adds product instances and setting one of those instances to the new base product instance
   * @param batches 
   * @returns null in case that request validation fails, otherwise returns the updated products and instances
   */
  BatchUpsertProduct = async (batches: UpsertProductBatch[]): Promise<{ product: IProduct; instances: IProductInstance[] }[] | null> => {
    if (!ValidateProductModifiersFunctionsCategoriesPrinterGroups(
      batches.flatMap(x => x.product.modifiers || []), // check invalid mods
      batches.flatMap(x => x.product.category_ids || []), // check invalid categories
      batches.reduce((pgids, x) => x.product.printerGroup ? [...pgids, x.product.printerGroup] : pgids, [] satisfies string[]), // check invalid printer groups
      this)) {
      return null;
    }
    // split out the two classes of operations
    // keep track by using indexed batches
    const indexedBatches = batches.map((x, i) => ({ ...x, index: i }));
    const updateBatches = (indexedBatches.filter(b => isUpdateProduct(b)) as (UpdateProductBatch & { index: number; })[]);
    const insertBatches = (indexedBatches.filter(b => !isUpdateProduct(b)) as (CreateProductBatch & { index: number; })[]);
    if (!IsSetOfUniqueStrings(updateBatches.map(x => x.product.id)) || //an IProduct to update can only appear once, otherwise an error is returned.
      updateBatches.reduce((acc, b) => {
        const updateIProductInstances = (b.instances.filter(b => isUpdateProductInstance(b)) as UpdateIProductUpdateIProductInstance[]);
        const insertInstances = b.instances.filter(b => !isUpdateProductInstance(b)) as CreateIProductInstance[];
        return (acc || this.#catalog.products[b.product.id] === undefined || // check product being updated exists
          updateIProductInstances.reduce((instanceParentAcc, ins) => instanceParentAcc ||
            this.#catalog.productInstances[ins.id] === undefined || // IProductInstance being updated must exist
            this.#catalog.productInstances[ins.id].productId !== b.product.id, false) || // IProductInstance being updated must belong to its parent IProduct
          !IsSetOfUniqueStrings(updateIProductInstances.map(x => x.id)) || // IProductInstance being updated must only appear once in the instances array
          updateIProductInstances.reduce((instanceAcc, ins) => instanceAcc || !ValidateModifiersForInstance((b.product.modifiers ?? this.#catalog.products[b.product.id].product.modifiers ?? []), this.#catalog.productInstances[ins.id].modifiers ?? ins.modifiers ?? []), false) || // for product update check product update instances have valid modifier spec
          insertInstances.reduce((instanceAcc, ins) => instanceAcc || !ValidateModifiersForInstance((b.product.modifiers ?? this.#catalog.products[b.product.id].product.modifiers ?? []), ins.modifiers ?? []), false) || // for product update check product insert instances have valid modifier spec
          insertBatches.reduce((acc, b) => acc || b.instances.length === 0 || // check product add has at least one instance
            b.instances.reduce((instanceAcc, ins) => instanceAcc || !ValidateModifiersForInstance(b.product.modifiers, ins.modifiers), false), false)); // for product add check product instances have valid modifier spec
      }, false)) {
      return null;
    }
    // validation passed! on to the work

    const catalogObjectsForUpsert: CatalogObject[] = [];
    const existingSquareObjects: CatalogObject[] = [];
    const existingSquareExternalIds: KeyValue[] = [];
    // these need to be deleted from square since they were previously not hidden from POS and now they are
    const externalIdsToDelete: KeyValue[] = [];

    // gather IProducts needing update in our DB, IProductInstances needing update in our DB, and products needing upsert in the square catalog
    const adjustedUpdateBatches = updateBatches.map((b, i) => {
      const oldProductEntry = this.Catalog.products[b.product.id];
      let removedModifierTypes: string[] = [];
      let addedModifierTypes = false;
      const adjustedPrice = b.product.price && b.product.price !== oldProductEntry.product.price ? b.product.price : null;
      const adjustedPrinterGroup = b.product.printerGroup !== oldProductEntry.product.printerGroup;
      if (b.product.modifiers) {
        const oldModifierTypes = oldProductEntry.product.modifiers.map(x => x.mtid);
        const newModifierTypes = b.product.modifiers.map(x => x.mtid);
        removedModifierTypes = oldModifierTypes.filter(x => !newModifierTypes.includes(x));
        addedModifierTypes = newModifierTypes.filter(x => !oldModifierTypes.includes(x)).length > 0;
      }
      const mergedProduct = { ...oldProductEntry.product, ...b.product };

      const insertInstances = b.instances.filter(b => !isUpdateProductInstance(b)) as CreateIProductInstance[];
      const adjustedInsertInstances: Omit<IProductInstance, 'id'>[] = insertInstances.map(x => {
        // we need to filter these external IDs because it'll interfere with adding the new product to the catalog
        return { ...x, productId: b.product.id, externalIDs: GetNonSquareExternalIds(x.externalIDs) };

      });
      // add the insert instances
      catalogObjectsForUpsert.push(...adjustedInsertInstances.filter(pi => pi.displayFlags.hideFromPos !== true).map((pi, k) =>
        ProductInstanceToSquareCatalogObject(
          LocationsConsidering3pFlag(mergedProduct.displayFlags.is3p),
          mergedProduct,
          pi,
          mergedProduct.printerGroup ? this.#printerGroups[mergedProduct.printerGroup] : null,
          this.CatalogSelectors, [], ('0000000' + ((i * 1000) + k)).slice(-7))));
      // aggregate explicit and implicit updates of product instances, and what square products might need deletion
      const explicitUpdateInstances = b.instances.filter(b => isUpdateProductInstance(b)) as UpdateIProductUpdateIProductInstance[];
      const updateInstanceIds = explicitUpdateInstances.map(x => x.id);
      const implicitUpdateInstances: IProductInstance[] = oldProductEntry.instances
        .filter(x => !updateInstanceIds.includes(x))
        .map((piId) => this.Catalog.productInstances[piId]!)
        .filter(pi => adjustedPrice !== null ||
          adjustedPrinterGroup ||
          addedModifierTypes ||
          pi.modifiers.filter(mod => removedModifierTypes.includes(mod.modifierTypeId)).length > 0)
        .map(pi => ({ ...pi, modifiers: pi.modifiers.filter(x => !removedModifierTypes.includes(x.modifierTypeId)) }));
      externalIdsToDelete.push(...explicitUpdateInstances.map(pi => this.Catalog.productInstances[pi.id]!.displayFlags.hideFromPos === false && pi.displayFlags?.hideFromPos === true ? GetSquareExternalIds(pi.externalIDs ?? this.Catalog.productInstances[pi.id]!.externalIDs) : []).flat());
      const adjustedUpdatedInstances: IProductInstance[] = [
        ...implicitUpdateInstances,
        ...explicitUpdateInstances.map(pi => {
          const oldInstance = this.Catalog.productInstances[pi.id]!;
          // these need to be deleted from square since they were previously not hidden from POS and now they are
          const needToDeleteSquareCatalogItem = oldInstance.displayFlags.hideFromPos === false && pi.displayFlags?.hideFromPos === true;
          const mergedExternalIds = ProductInstanceUpdateMergeExternalIds(this.Catalog.productInstances[pi.id]!.externalIDs, pi.externalIDs);
          const newExternalIds = needToDeleteSquareCatalogItem ? GetNonSquareExternalIds(mergedExternalIds) : mergedExternalIds;
          if (needToDeleteSquareCatalogItem) {
            externalIdsToDelete.push(...GetSquareExternalIds(mergedExternalIds));
          }
          return { ...oldInstance, ...pi, externalIDs: newExternalIds };
        })];
      existingSquareExternalIds.push(...adjustedUpdatedInstances.map((pi) => GetSquareExternalIds(pi.externalIDs)).flat());
      return { product: mergedProduct, updateInstances: adjustedUpdatedInstances, insertInstances: adjustedInsertInstances, batchIter: i, index: b.index };
    });

    const batchIter = adjustedUpdateBatches.length;
    // first grab all the square catalog objects from the external IDs from products (and instances) being updated
    // by getting these first, we can avoid modifiying anything if we get an error here
    if (existingSquareExternalIds.length > 0) {
      const batchRetrieveCatalogObjectsResponse = await SquareProviderInstance.BatchRetrieveCatalogObjects(existingSquareExternalIds.map(x => x.value), false);
      if (!batchRetrieveCatalogObjectsResponse.success) {
        logger.error(`Getting current square CatalogObjects failed with ${JSON.stringify(batchRetrieveCatalogObjectsResponse.error)}`);
        return null;
      }
      existingSquareObjects.push(...batchRetrieveCatalogObjectsResponse.result.objects ?? []);
    }

    // now that we have square catalog items we can add on the insert and update objects
    catalogObjectsForUpsert.push(...adjustedUpdateBatches.flatMap((b) => {
      const updateCatalogObjects = b.updateInstances.flatMap((pi, j) => {
        return pi.displayFlags.hideFromPos ? [] : [ProductInstanceToSquareCatalogObject(
          LocationsConsidering3pFlag(b.product.displayFlags.is3p),
          b.product,
          pi,
          b.product.printerGroup ? this.#printerGroups[b.product.printerGroup] : null,
          this.CatalogSelectors, existingSquareObjects,
          ('0000000' + (((b.batchIter) * 1000) + j)).slice(-7))];
      });
      const insertCatalogObjects = b.insertInstances.flatMap((pi, k) => {
        return pi.displayFlags.hideFromPos ? [] : [ProductInstanceToSquareCatalogObject(
          LocationsConsidering3pFlag(b.product.displayFlags.is3p),
          b.product,
          pi,
          b.product.printerGroup ? this.#printerGroups[b.product.printerGroup] : null,
          this.CatalogSelectors, [],
          ('0000000' + (((b.batchIter) * 1000) + b.updateInstances.length + k)).slice(-7))];
      });
      return [...updateCatalogObjects, ...insertCatalogObjects];
    }));

    const adjustedInsertBatches = insertBatches.map((b, i) => {
      // we're inserting a new product and instances. the first instance is the base product instance
      // we need to filter these square specific external IDs because it'll interfere with adding the new product to the catalog
      const adjustedProduct: Omit<IProduct, 'id' | 'baseProductId'> = { ...b.product, externalIDs: GetNonSquareExternalIds(b.product.externalIDs) };
      const adjustedInstances: Omit<IProductInstance, 'id' | 'productId'>[] = b.instances.map(x => ({ ...x, externalIDs: GetNonSquareExternalIds(x.externalIDs) }))
      // first add the stuff to square so we can write to the DB in two operations
      catalogObjectsForUpsert.push(...adjustedInstances.filter(pi => pi.displayFlags.hideFromPos !== true).map((pi, j) =>
        ProductInstanceToSquareCatalogObject(
          LocationsConsidering3pFlag(adjustedProduct.displayFlags.is3p),
          adjustedProduct,
          pi,
          adjustedProduct.printerGroup ? this.#printerGroups[adjustedProduct.printerGroup] : null,
          this.CatalogSelectors, [], ('0000000' + (((i + batchIter + 2) * 1000) + j)).slice(-7))));
      return { product: adjustedProduct, instances: adjustedInstances, batchIter: i + batchIter + 2, index: i };
    });

    let mappings: CatalogIdMapping[];
    if (catalogObjectsForUpsert.length) {
      const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects(chunk(catalogObjectsForUpsert, SQUARE_BATCH_CHUNK_SIZE).map(x => ({ objects: x })));
      if (!upsertResponse.success) {
        logger.error(`Failed to save square products, got errors: ${JSON.stringify(upsertResponse.error)}`);
        return null;
      }
      mappings = (upsertResponse.result.idMappings ?? []);
    }

    const bulkUpdate = adjustedUpdateBatches.map((b) => {
      return {
        index: b.index,
        product: b.product,
        instances: b.updateInstances.map((pi, j) => {
          return {
            ...pi,
            productId: b.product.id,
            externalIDs: [...pi.externalIDs, ...IdMappingsToExternalIds(mappings, ('0000000' + ((b.batchIter * 1000) + j)).slice(-7))]
          }
        })
      };
    }) as { product: IProduct, instances: IProductInstance[], index: number }[];
    const updateBatchesInserts = adjustedUpdateBatches.map((b) => {
      return {
        index: b.index,
        instances: b.insertInstances.map((pi, j) => {
          return new WProductInstanceModel({
            ...pi,
            productId: b.product.id,
            externalIDs: [...pi.externalIDs, ...IdMappingsToExternalIds(mappings, ('0000000' + ((b.batchIter * 1000) + b.updateInstances.length + j)).slice(-7))]
          });
        })
      };
    });
    const insertBatchInserts = adjustedInsertBatches.map((b) => {
      const productDoc = new WProductModel(b.product);
      const batchInstanceDocs = b.instances.map((x, j) => new WProductInstanceModel({
        ...x,
        productId: productDoc.id,
        externalIDs: [...x.externalIDs, ...IdMappingsToExternalIds(mappings, ('0000000' + ((b.batchIter * 1000) + j)).slice(-7))]
      }));
      productDoc.baseProductId = batchInstanceDocs[0].id;
      return { product: productDoc, instances: batchInstanceDocs, index: b.index };
    })
    if (insertBatchInserts.length) {
      const bulkProductInsert = await WProductModel.insertMany(insertBatchInserts.map(o => o.product));
      logger.debug(`Saved new WProductModels: ${JSON.stringify(bulkProductInsert.map(x => x.toObject()))}`);
    }
    const productInstanceInserts = [...insertBatchInserts, ...updateBatchesInserts];
    if (productInstanceInserts.length) {
      const bulkProductInstanceInsert = await WProductInstanceModel.insertMany(([...insertBatchInserts, ...updateBatchesInserts]).flatMap(x => x.instances));
      logger.debug(`Instances creation result: ${JSON.stringify(bulkProductInstanceInsert.map(x => x.toObject()))}`);
    }
    if (bulkUpdate.length) {
      // @ts-ignore
      const bulkProductUpdate = await WProductModel.bulkWrite(bulkUpdate.map(b => ({
        updateOne: {
          filter: { _id: b.product.id },
          update: b.product
        }
      })));
      logger.info(`Bulk update of WProductModel successful: ${JSON.stringify(bulkProductUpdate)}`);
      // @ts-ignore
      const bulkProductInstanceUpdate = await WProductInstanceModel.bulkWrite(bulkUpdate.flatMap(b => b.instances.map(pi => ({
        updateOne: {
          filter: { _id: pi.id },
          update: pi
        }
      }))));
      logger.info(`Bulk update of WProductInstanceModel successful: ${JSON.stringify(bulkProductInstanceUpdate)}`);
    }
    await Promise.all([this.SyncProducts(), this.SyncProductInstances()]);
    this.RecomputeCatalogAndEmit();

    const reconstructedBatches: Record<number, { product: IProduct; instances: IProductInstance[]; index: number; }> = {};
    insertBatchInserts.forEach(b => {
      const product = b.product.toObject();
      const instances = b.instances.map(x => x.toObject());
      reconstructedBatches[b.index] = { product, instances, index: b.index };
    });
    bulkUpdate.forEach(b => {
      reconstructedBatches[b.index] = { product: b.product, instances: b.instances, index: b.index };
    });
    updateBatchesInserts.forEach(b => {
      reconstructedBatches[b.index].instances = [...b.instances.map(x => x.toObject()), ...reconstructedBatches[b.index].instances];
    });
    return Object.values(reconstructedBatches).sort((a, b) => a.index - b.index).map(x => ({ product: x.product, instances: x.instances.sort((a, b) => a.ordinal - b.ordinal) }));
  };

  UpdateProduct = async (pid: string, product: Partial<Omit<IProduct, 'id'>>) => {
    const result = await this.BatchUpsertProduct([{ product: { id: pid, ...product }, instances: [] }]);
    return result ? result[0].product : null;
  }

  BatchDeleteProduct = async (p_ids: string[], suppress_catalog_recomputation: boolean = false) => {
    logger.debug(`Removing Product(s) ${p_ids.join(", ")}`);
    const productEntries = p_ids.map(x => this.#catalog.products[x]!);

    // needs to be ._id, NOT .id
    const doc = await WProductModel.deleteMany({ _id: { $in: p_ids } }).exec();
    if (!doc) {
      return null;
    }
    // removing ALL product instances from Square
    await BatchDeleteCatalogObjectsFromExternalIds(productEntries.reduce((acc, pe) => [...acc, ...pe.instances], []).reduce((acc, pi) => [...acc, ...this.#catalog.productInstances[pi]!.externalIDs], []));

    const product_instance_delete = await WProductInstanceModel.deleteMany({ productId: { $in: p_ids } }).exec();
    if (product_instance_delete.deletedCount > 0) {
      logger.debug(`Removed ${product_instance_delete.deletedCount} Product Instances.`);
      await this.SyncProductInstances();
    }
    await this.SyncProducts();
    if (!suppress_catalog_recomputation) {
      this.RecomputeCatalogAndEmit();
    }
    return doc;
  }

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
    return doc.toObject();
  }

  CreateProductInstance = async (instance: Omit<IProductInstance, 'id'>) => {
    // we need to filter these external IDs because it'll interfere with adding the new product to the catalog
    const filteredExternalIds = GetNonSquareExternalIds(instance.externalIDs);
    let adjustedInstance: Omit<IProductInstance, 'id'> = { ...instance, externalIDs: filteredExternalIds };

    if (instance.displayFlags.hideFromPos !== true) {
      // add the product instance to the square catalog here
      const product = this.#catalog.products[adjustedInstance.productId]!.product;
      const upsertResponse = await SquareProviderInstance.UpsertCatalogObject(ProductInstanceToSquareCatalogObject(
        LocationsConsidering3pFlag(product.displayFlags.is3p),
        product,
        adjustedInstance,
        product.printerGroup ? this.#printerGroups[product.printerGroup] : null,
        this.CatalogSelectors,
        [],
        ""));
      if (!upsertResponse.success) {
        logger.error(`failed to add square product, got errors: ${JSON.stringify(upsertResponse.error)}`);
        return null;
      }
      adjustedInstance = {
        ...adjustedInstance,
        externalIDs: [...adjustedInstance.externalIDs, ...IdMappingsToExternalIds(upsertResponse.result.idMappings, "")]
      };
    }
    const doc = new WProductInstanceModel(adjustedInstance);
    await doc.save();
    await this.SyncProductInstances();
    this.RecomputeCatalogAndEmit();
    return doc.toObject();
  };

  BatchUpdateProductInstance = async (batches: UpdateProductInstanceProps[], suppress_catalog_recomputation: boolean = false): Promise<(IProductInstance | null)[]> => {
    logger.info(`Updating product instance(s) ${batches.map(x => `ID: ${x.piid}, changes: ${JSON.stringify(x.productInstance)}`).join(", ")}, ${suppress_catalog_recomputation ? "and suppressing the catalog recomputation" : ""}`);

    // TODO: if switching from hideFromPos === false to hideFromPos === true, we need to delete the product in square
    const oldProductInstances = batches.map(b => this.Catalog.productInstances[b.piid]!);
    const newExternalIdses = batches.map((b, i) => ProductInstanceUpdateMergeExternalIds(oldProductInstances[i].externalIDs, GetNonSquareExternalIds(b.productInstance.externalIDs)));
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

    const mappings: CatalogIdMapping[] = [];
    const catalogObjects = batches.map((b, i) => {
      const mergedInstance = { ...oldProductInstances[i], ...b.productInstance };
      return mergedInstance.displayFlags.hideFromPos === true ? [] : [ProductInstanceToSquareCatalogObject(
        LocationsConsidering3pFlag(b.product.displayFlags.is3p),
        b.product,
        mergedInstance,
        b.product.printerGroup ? this.#printerGroups[b.product.printerGroup] : null,
        this.CatalogSelectors, existingSquareObjects, ('000' + i).slice(-3))];
    }).flat();
    if (catalogObjects.length > 0) {
      const upsertResponse = await SquareProviderInstance.BatchUpsertCatalogObjects(chunk(catalogObjects, SQUARE_BATCH_CHUNK_SIZE).map(x => ({ objects: x })));
      if (!upsertResponse.success) {
        logger.error(`Failed to update square product, got errors: ${JSON.stringify(upsertResponse.error)}`);
        return batches.map(_ => null);
      }
      mappings.push(...(upsertResponse.result.idMappings ?? []))
    }

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
      return doc.toObject();
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
      return doc.toObject();
    }
    return null;
  }

  CreateProductInstanceFunction = async (productInstanceFunction: Omit<IProductInstanceFunction, 'id'>) => {
    const doc = new WProductInstanceFunctionModel(productInstanceFunction);
    await doc.save();
    await this.SyncProductInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return doc.toObject();
  };

  UpdateProductInstanceFunction = async (pif_id: string, productInstanceFunction: Omit<IProductInstanceFunction, 'id'>) => {
    const updated = await WProductInstanceFunctionModel
      .findByIdAndUpdate(pif_id, productInstanceFunction, { new: true }).exec();
    if (!updated) {
      return null;
    }
    await this.SyncProductInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return updated.toObject();
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
    return doc.toObject();
  }

  CreateOrderInstanceFunction = async (orderInstanceFunction: Omit<OrderInstanceFunction, 'id'>) => {
    const doc = new WOrderInstanceFunctionModel(orderInstanceFunction);
    await doc.save();
    await this.SyncOrderInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return doc.toObject();
  };

  UpdateOrderInstanceFunction = async (id: string, orderInstanceFunction: Partial<Omit<OrderInstanceFunction, 'id'>>) => {
    const updated = await WOrderInstanceFunctionModel.findByIdAndUpdate(id, orderInstanceFunction, { new: true });
    if (!updated) {
      return null;
    }
    await this.SyncOrderInstanceFunctions();
    this.RecomputeCatalogAndEmit();
    return updated.toObject();
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
    return doc.toObject();
  }

  /**
   * Checks and removes fulfullment ID from ICategory.serviceDisable and IProduct.serviceDisable and IProduct.modifiers.serviceDisable 
   * performed BEFORE a fulfillment is deleted from the DataProvider
   *  */
  BackfillRemoveFulfillment = async (id: string) => {
    logger.debug(`Removing fulfillment ID ${id} references, if any exist.`);
    const products_update = await WProductModel.updateMany({}, { $pull: { serviceDisable: id, "modifiers.$[].serviceDisable": id } }).exec();
    if (products_update.modifiedCount > 0) {
      logger.debug(`Removed serviceDisable fulfillment ID from ${products_update.modifiedCount} products and modifiers.`);
      await this.SyncProducts();
    }
    const category_update = await WCategoryModel.updateMany({}, { $pull: { serviceDisable: id } }).exec();
    if (category_update.modifiedCount > 0) {
      logger.debug(`Removed serviceDisable fulfillment ID from ${category_update.modifiedCount} categories.`);
      await this.SyncCategories();
    }
    if (products_update.modifiedCount > 0 || category_update.modifiedCount > 0) {
      this.RecomputeCatalogAndEmit();
    }
  }
}

export const CatalogProviderInstance = new CatalogProvider();
