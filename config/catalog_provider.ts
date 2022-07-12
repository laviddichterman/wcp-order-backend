import { GenerateMenu, ICatalog, SEMVER, ICatalogCategories, ICatalogModifiers, ICategory, IMenu, IOption, IOptionType, IProduct, IProductInstance, IProductInstanceFunction, IAbstractExpression, ICatalogProducts } from "@wcp/wcpshared";
import WCategoryModel from '../models/ordering/category/WCategorySchema';
import WProductInstanceModel from '../models/ordering/products/WProductInstanceSchema';
import WProductModel from '../models/ordering/products/WProductSchema';
import WOptionModel from '../models/ordering/options/WOptionSchema';
import WOptionTypeModel from '../models/ordering/options/WOptionTypeSchema';
import WProductInstanceFunctionModel from '../models/query/WProductInstanceFunction';
import Promise from 'bluebird';
import logger from '../logging';


const ReduceArrayToMapByKey = function (xs, key) {
  const iv = {};
  return xs.reduce((obj, item) => {
    return {
      ...obj,
      [item[key]]: item,
    };
  }, iv);
};

// Returns [ category_map, product_map ] list;
// category_map entries are mapping of catagory_id to { category, children (id list), product (id list) }
// product_map is mapping from product_id to { product, instances (list of instance objects)}
// orphan_products is list of orphan product ids
const CatalogMapGenerator = (categories: ICategory[], products : IProduct[], product_instances : IProductInstance[]) => {
  const category_map: ICatalogCategories = {};
  categories.forEach((curr) => {
    category_map[curr._id] = { category: curr, children: [], products: [] };
  });
  for (var i = 0; i < categories.length; ++i) {
    if (categories[i].parent_id) {
      category_map[categories[i].parent_id].children.push(categories[i]._id);
    }
  }
  const product_map : ICatalogProducts = {};
  products.forEach((curr) => {
    product_map[curr._id] = { product: curr, instances: [] };
    if (curr.category_ids.length !== 0) {
      curr.category_ids.forEach((cid) => {
        category_map[cid] ? category_map[cid].products.push(curr._id) : console.error(`Missing category ID: ${cid} in product: ${JSON.stringify(curr)}`);
      });
    }
  });
  product_instances.forEach((curr) => {
    product_map[curr.product_id].instances.push(curr);
  })
  return [category_map, product_map];
};

const ModifierTypeMapGenerator = (modifier_types: IOptionType[], options: IOption[]) => {
  var modifier_types_map: ICatalogModifiers = {};
  modifier_types.forEach(mt => {
    modifier_types_map[mt._id] = { options: [], modifier_type: mt };
  });
  options.forEach(o => {
    if (Object.hasOwn(modifier_types_map, o.option_type_id)) {
      modifier_types_map[o.option_type_id].options.push(o);
    }
    else {
      logger.error(`Modifier Type ID ${o.option_type_id} referenced by ModifierOption ${o._id} not found!`);
    }
  });
  return modifier_types_map;
};

const CatalogGenerator = (
  categories: ICategory[],
  modifier_types: IOptionType[],
  options: IOption[],
  products: IProduct[],
  product_instances: IProductInstance[],
  product_instance_functions: IProductInstanceFunction[],
  api: SEMVER) => {
  const modifier_types_map = ModifierTypeMapGenerator(modifier_types, options);
  const [category_map, product_map] = CatalogMapGenerator(categories, products, product_instances);
  return {
    modifiers: modifier_types_map,
    categories: category_map,
    products: product_map,
    version: Date.now().toString(36).toUpperCase(),
    product_instance_functions: product_instance_functions,
    api,
  } as ICatalog;
}

//TODO this should exist in the WAbstractExpression class file but I had trouble getting it to work since the type itself is recursive
const FindModifierPlacementExpressionsForMTID: (expr: IAbstractExpression, mtid: string) => IAbstractExpression[] = function (expr, mtid) {
  switch (expr.discriminator) {
    case "IfElse":
      return FindModifierPlacementExpressionsForMTID(expr.if_else.true_branch, mtid).concat(
        FindModifierPlacementExpressionsForMTID(expr.if_else.false_branch, mtid)).concat(
          FindModifierPlacementExpressionsForMTID(expr.if_else.test, mtid));
    case "Logical":
      const operandA_expressions = expr.logical.operandA ? FindModifierPlacementExpressionsForMTID(expr.logical.operandA, mtid) : [];
      const operandB_expressions = expr.logical.operandB ? FindModifierPlacementExpressionsForMTID(expr.logical.operandB, mtid) : [];
      return operandA_expressions.concat(operandB_expressions);
    case "ModifierPlacement":
      return expr.modifier_placement.mtid === mtid ? [expr] : [];
    case "HasAnyOfModifierType":
    case "ConstLiteral":
    default:
      return [];
  }
}

//TODO this should exist in the WAbstractExpression class file
const FindHasAnyModifierExpressionsForMTID: (expr: IAbstractExpression, mtid: string) => IAbstractExpression[] = function (expr, mtid) {
  switch (expr.discriminator) {
    case "IfElse":
      return FindHasAnyModifierExpressionsForMTID(expr.if_else.true_branch, mtid).concat(
        FindHasAnyModifierExpressionsForMTID(expr.if_else.false_branch, mtid)).concat(
          FindHasAnyModifierExpressionsForMTID(expr.if_else.test, mtid));
    case "Logical":
      const operandA_expressions = expr.logical.operandA ? FindHasAnyModifierExpressionsForMTID(expr.logical.operandA, mtid) : [];
      const operandB_expressions = expr.logical.operandB ? FindHasAnyModifierExpressionsForMTID(expr.logical.operandB, mtid) : [];
      return operandA_expressions.concat(operandB_expressions);
    case "HasAnyOfModifierType":
      return expr.has_any_of_modifier.mtid === mtid ? [expr] : [];
    case "ModifierPlacement":
    case "ConstLiteral":
    default:
      return [];
  }
}

const ValidateProductModifiersFunctionsCategories = function (modifiers, category_ids : string[], catalog: CatalogProvider) {
  const found_all_modifiers = modifiers.map(entry =>
    catalog.ModifierTypes.some(x => x._id.toString() === entry.mtid) &&
    (entry.enable === null || catalog.ProductInstanceFunctions.some(x => x._id.toString() === entry.enable))).every(x => x === true);
  const found_all_categories = category_ids.map(cid => catalog.Categories.some(x => x._id.toString() === cid)).every(x => x === true);
  return found_all_categories && found_all_modifiers;
}

class CatalogProvider {
  #socketRO;
  #categories: ICategory[];
  #modifier_types: IOptionType[];
  #options: IOption[];
  #products: IProduct[];
  #product_instances: IProductInstance[];
  #product_instance_functions: IProductInstanceFunction[];
  #catalog: ICatalog;
  #menu: IMenu;
  #apiver;
  constructor(socketRO) {
    this.#socketRO = socketRO;
    this.#categories = [];
    this.#modifier_types = [];
    this.#options = [];
    this.#products = [];
    this.#product_instances = [];
    this.#product_instance_functions = [];
    this.#apiver = { major: 0, minor: 0, patch: 0 };
    this.#catalog = CatalogGenerator([], [], [], [], [], [], {major: 0, minor: 0, patch: 0});
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

  get Catalog() {
    return this.#catalog;
  }

  get Menu() {
    return this.#menu;
  }

  SyncCategories = async () => {
    // categories
    logger.debug(`Syncing Categories.`);
    try {
      this.#categories = await WCategoryModel.find().exec();
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
      this.#modifier_types = await this.#dbconn.WOptionTypeSchema.find().exec();
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
      this.#options = await this.#dbconn.WOptionSchema.find().exec();
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
      this.#products = await this.#dbconn.WProductSchema.find().exec();
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
      this.#product_instances = await this.#dbconn.WProductInstanceSchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching product instances with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncProductInstanceFunctions = async () => {
    logger.debug(`Syncing Product Instance Functions.`);
    try {
      this.#product_instance_functions = await this.#dbconn.WProductInstanceFunction.find().exec();
    } catch (err) {
      logger.error(`Failed fetching product instance functions with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  EmitCatalog = (dest) => {
    dest.emit('WCP_CATALOG', this.#catalog);
  }

  RecomputeCatalog = () => {
    this.#catalog = CatalogGenerator(this.#categories, this.#modifier_types, this.#options, this.#products, this.#product_instances, this.#product_instance_functions, this.#apiver);
    this.#menu = GenerateMenu(this.#catalog, new Date());
  }

  Bootstrap = async (cb) => {
    // load catalog from DB, do not push to clients as that'll be handled when a new client connects
    logger.info("Loading catalog from database...");

    this.#apiver = await this.#dbconn.DBVersionSchema.findOne().exec()

    await this.SyncCategories();

    await this.SyncModifierTypes();

    await this.SyncOptions();

    await this.SyncProducts();

    await this.SyncProductInstances();

    await this.SyncProductInstanceFunctions();

    this.RecomputeCatalog();

    if (cb) {
      return await cb();
    }
  };

  CreateCategory = async ({ description, name, ordinal, parent_id, subheading, footnotes, display_flags }) => {
    const doc = new WCategoryModel({
      description: description,
      name: name,
      ordinal,
      parent_id,
      subheading,
      footnotes,
      display_flags: display_flags
    });
    await doc.save();
    await this.SyncCategories();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateCategory = async (category_id, { name, description, ordinal, subheading, footnotes, parent_id, display_flags }) => {
    try {
      const category_id_map = ReduceArrayToMapByKey(this.#categories, "_id");
      if (!category_id_map[category_id]) {
        // not found
        return null;
      }
      var cycle_update_promise = null;
      if (category_id_map[category_id].parent_id !== parent_id && parent_id) {
        // need to check for potential cycle
        var cur = parent_id;
        while (cur && category_id_map[cur].parent_id != category_id) {
          cur = category_id_map[cur].parent_id;
        }
        // if the cursor is not empty/null/blank then we stopped because we found the cycle
        if (cur) {
          logger.debug(`In changing ${category_id}'s parent_id to ${parent_id}, found cycle at ${cur}, blanking out ${cur}'s parent_id to prevent cycle.`);
          category_id_map[cur].parent_id = null;
          cycle_update_promise = category_id_map[cur].save();
        }
      }
      category_id_map[category_id].name = name;
      category_id_map[category_id].description = description;
      category_id_map[category_id].parent_id = parent_id;
      category_id_map[category_id].ordinal = ordinal;
      category_id_map[category_id].subheading = subheading;
      category_id_map[category_id].footnotes = footnotes;
      category_id_map[category_id].display_flags = display_flags;
      await category_id_map[category_id].save();
      if (cycle_update_promise) {
        await cycle_update_promise;
      }
      await this.SyncCategories();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      // is this going to still be valid after the Sync above?
      return category_id_map[category_id];
    } catch (err) {
      throw err;
    }
  };

  DeleteCategory = async (category_id) => {
    logger.debug(`Removing ${category_id}`);
    try {
      const doc = await WCategoryModel.findByIdAndDelete(category_id);
      if (!doc) {
        return null;
      }
      await Promise.all(this.#categories.map(async (cat) => {
        if (cat.parent_id && cat.parent_id === category_id) {
          cat.parent_id = "";
          await cat.save();
        }
      }));
      const products_update = await WProductModel.updateMany({}, { $pull: { category_ids: category_id } });
      if (products_update.modifiedCount > 0) {
        logger.debug(`Removed Category ID from ${products_update.modifiedCount} products.`);
        await this.SyncProducts();
      }
      await this.SyncCategories();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateModifierType = async ({ name, display_name, ordinal, min_selected, max_selected, externalIDs, display_flags }) => {
    const doc = new WOptionTypeModel({
      name,
      display_name,
      ordinal,
      min_selected,
      max_selected,
      externalIDs,
      display_flags
    });
    await doc.save();
    await this.SyncModifierTypes();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateModifierType = async (mt_id, { name, display_name, ordinal, min_selected, max_selected, externalIDs, display_flags }) => {
    try {
      const updated = await WOptionTypeModel.findByIdAndUpdate(
        mt_id,
        {
          name,
          display_name,
          ordinal,
          min_selected,
          max_selected,
          externalIDs,
          display_flags
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncModifierTypes();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteModifierType = async (mt_id) => {
    logger.debug(`Removing Modifier Type: ${mt_id}`);
    try {
      const doc = await WOptionTypeModel.findByIdAndDelete(mt_id);
      if (!doc) {
        logger.warn("Unable to delete the ModifierType from the database.");
        return null;
      }
      const options_delete = await WOptionModel.deleteMany({ option_type_id: mt_id });
      if (this.#catalog.modifiers[mt_id].options.length !== options_delete.deletedCount) {
        logger.error(`Mismatch between number of modifier options deleted and the number the catalog sees as child of this modifier type.`);
      }
      if (options_delete.deletedCount > 0) {
        logger.debug(`Removed ${options_delete.deletedCount} Options from the catalog.`);
      }
      const products_update = await WProductModel.updateMany({}, { $pull: { modifiers: mt_id } });
      if (products_update.modifiedCount > 0) {
        const product_instance_update = await WProductInstanceModel.updateMany({}, { $pull: { modifiers: { modifier_type_id: mt_id } } });
        logger.debug(`Removed ModifierType ID from ${products_update.modifiedCount} products, ${product_instance_update.modifiedCount} product instances.`);
        await this.SyncProducts();
        await this.SyncProductInstances();
      }
      // need to delete any ProductInstanceFunctions that use this MT
      await Promise.all(this.#product_instance_functions.map(async (pif) => {
        if (FindModifierPlacementExpressionsForMTID(pif.expression, mt_id).length > 0) {
          logger.debug(`Found product instance function composed of ${mt_id}, removing PIF with ID: ${pif._id}.`);
          // the PIF and any dependent objects will be synced, but the catalog will not be recomputed / emitted
          await this.DeleteProductInstanceFunction(pif._id, true);
        } else if (FindHasAnyModifierExpressionsForMTID(pif.expression, mt_id).length > 0) {
          logger.debug(`Found product instance function composed of ${mt_id}, removing PIF with ID: ${pif._id}.`);
          // the PIF and any dependent objects will be synced, but the catalog will not be recomputed / emitted
          await this.DeleteProductInstanceFunction(pif._id, true);
        }
      }));
      await this.SyncOptions();
      await this.SyncModifierTypes();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateOption = async ({
    option_type_id,
    display_name,
    description,
    price,
    shortcode,
    disabled,
    externalIDs,
    ordinal,
    flavor_factor,
    bake_factor,
    can_split,
    enable_function,
    display_flags
  }) => {
    // first find the Modifier Type ID in the catalog
    var option_type = this.#modifier_types.find(x => x._id.toString() === option_type_id);
    if (!option_type) {
      return null;
    }

    const doc = new WOptionModel({
      item: {
        price: {
          amount: price.amount,
          currency: price.currency,
        },
        description: description,
        display_name: display_name,
        shortcode: shortcode,
        disabled: disabled,
        permanent_disable: false,
        externalIDs
      },
      option_type_id: option_type_id,
      ordinal: ordinal,
      metadata: {
        flavor_factor: flavor_factor,
        bake_factor: bake_factor,
        can_split: can_split,
      },
      enable_function: enable_function,
      display_flags: display_flags
    });
    await doc.save();
    await this.SyncOptions();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateModifierOption = async (mo_id, {
    //mt_id, 
    display_name,
    description,
    price,
    shortcode,
    disabled,
    externalIDs,
    ordinal,
    flavor_factor,
    bake_factor,
    can_split,
    enable_function,
    display_flags }) => {
    try {
      //TODO: post update: rebuild all products with the said modifier option since the ordinal might have changed
      // 
      const updated = await WOptionModel.findByIdAndUpdate(
        mo_id,
        {
          item: {
            price: {
              amount: price.amount,
              currency: price.currency,
            },
            description: description,
            display_name: display_name,
            shortcode: shortcode,
            disabled: disabled,
            permanent_disable: false,
            externalIDs
          },
          ordinal: ordinal,
          metadata: {
            flavor_factor: flavor_factor,
            bake_factor: bake_factor,
            can_split: can_split,
          },
          enable_function: enable_function,
          display_flags: display_flags
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncOptions();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteModifierOption = async (mo_id) => {
    logger.debug(`Removing Modifier Option ${mo_id}`);
    try {
      const doc = await WOptionModel.findByIdAndDelete(mo_id);
      if (!doc) {
        return null;
      }
      const product_instance_options_delete = await WProductInstanceModel.updateMany(
        { "modifiers.modifier_type_id": doc.option_type_id },
        { $pull: { "modifiers.$.options": { option_id: mo_id } } });
      if (product_instance_options_delete.modifiedCount > 0) {
        logger.debug(`Removed ${product_instance_options_delete.modifiedCount} Options from Product Instances.`);
        await this.SyncProductInstances();
      }
      await this.SyncOptions();
      // need to delete any ProductInstanceFunctions that use this MO
      await Promise.all(this.#product_instance_functions.map(async (pif) => {
        const dependent_pfi_expressions = FindModifierPlacementExpressionsForMTID(pif.expression, doc.option_type_id);
        const filtered = dependent_pfi_expressions.filter(x => x.modifier_placement.moid === mo_id)
        if (filtered.length > 0) {
          logger.debug(`Found product instance function composed of ${doc.option_type_id}:${mo_id}, removing PIF with ID: ${pif._id}.`);
          // the PIF and any dependent objects will be synced, but the catalog will not be recomputed / emitted
          await this.DeleteProductInstanceFunction(pif._id, true);
        }
      }));
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
    }
  }



  CreateProduct = async ({
    price,
    disabled,
    service_disable,
    display_flags,
    externalIDs,
    modifiers,
    category_ids,
    suppress_catalog_recomputation = false
  }) => {
    if (!ValidateProductModifiersFunctionsCategories(modifiers, category_ids, this)) {
      return null;
    }

    const doc = new WProductModel({
      item: {
        externalIDs
      },
      disabled,
      price,
      service_disable,
      display_flags,
      modifiers,
      category_ids
    });
    await doc.save();
    await this.SyncProducts();
    if (!suppress_catalog_recomputation) {
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
    }
    return doc;
  };

  UpdateProduct = async (pid, {
    price,
    disabled,
    service_disable,
    display_flags,
    externalIDs,
    modifiers,
    category_ids }) => {
    try {
      if (!ValidateProductModifiersFunctionsCategories(modifiers, category_ids, this)) {
        return null;
      }
      const old_modifiers = this.#catalog.products[pid].product.modifiers.map(x => x.mtid.toString());
      const new_modifiers_mtids = modifiers.map(x => String(x.mtid));
      const removed_modifiers = old_modifiers.filter(x => !new_modifiers_mtids.includes(x));
      const updated = await WProductModel.findByIdAndUpdate(
        pid,
        {
          item: {
            externalIDs
          },
          disabled,
          price,
          service_disable,
          display_flags,
          modifiers: modifiers,
          category_ids: category_ids
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }

      if (removed_modifiers.length) {
        await Promise.all(removed_modifiers.map(async (mtid) => {
          const product_instance_update = await WProductInstanceModel.updateMany({ product_id: pid }, { $pull: { modifiers: { modifier_type_id: mtid } } });
          logger.debug(`Removed ModifierType ID ${mtid} from ${product_instance_update.modifiedCount} product instances.`);
        }));
        await this.SyncProductInstances();
      }

      await this.SyncProducts();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProduct = async (p_id) => {
    logger.debug(`Removing Product ${p_id}`);
    try {
      const doc = await WProductModel.findByIdAndDelete(p_id);
      if (!doc) {
        return null;
      }
      const product_instance_delete = await WProductInstanceModel.deleteMany({ product_id: p_id });
      if (product_instance_delete.deletedCount > 0) {
        logger.debug(`Removed ${product_instance_delete.deletedCount} Product Instances.`);
        await this.SyncProductInstances();
      }
      await this.SyncProducts();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateProductInstance = async (parent_product_id, {
    description,
    display_name,
    shortcode,
    ordinal,
    externalIDs,
    modifiers,
    is_base,
    display_flags
  }) => {
    const doc = new this.#dbconn.WProductInstanceSchema({
      product_id: parent_product_id,
      item: {
        description,
        display_name,
        shortcode,
        externalIDs,
      },
      ordinal,
      modifiers,
      is_base,
      display_flags
    });
    await doc.save();
    await this.SyncProductInstances();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateProductInstance = async (pid, piid, {
    display_name,
    description,
    shortcode,
    ordinal,
    externalIDs,
    modifiers,
    is_base,
    display_flags
  }) => {
    try {
      const updated = await WProductInstanceModel.findByIdAndUpdate(
        piid,
        {
          product_id: pid,
          item: {
            description,
            display_name,
            shortcode,
            externalIDs
          },
          ordinal,
          modifiers,
          is_base,
          display_flags
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }

      await this.SyncProductInstances();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProductInstance = async (pi_id) => {
    logger.debug(`Removing Product Instance: ${pi_id}`);
    try {
      const doc = await WProductInstanceModel.findByIdAndDelete(pi_id);
      if (!doc) {
        return null;
      }
      await this.SyncProductInstances();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
    }
  }

  CreateProductInstanceFunction = async ({
    name,
    expression
  }) => {

    const expressions = [];
    const doc = new WProductInstanceFunctionModel({
      name: name,
      expression: expression//await GenerateAbstractExpression(this.#dbconn, expression)
    });
    await doc.save();
    await this.SyncProductInstanceFunctions();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateProductInstanceFunction = async (pif_id, {
    name,
    expression
  }) => {
    try {
      const updated = await WProductInstanceFunctionModel.findByIdAndUpdate(
        pif_id,
        {
          name: name,
          expression: expression
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      // since the product instance function is bound to the modifier types and modifier options that contain them, we need to sync those objects here
      await this.SyncOptions();
      await this.SyncProducts();
      await this.SyncProductInstanceFunctions();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProductInstanceFunction = async (pif_id, suppress_catalog_recomputation = false) => {
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
        this.EmitCatalog(this.#socketRO);
      }
      return doc;
    } catch (err) {
      throw err;
    }
  }
}



module.exports = ({ socketRO }) => {
  return new CatalogProvider(socketRO);
}