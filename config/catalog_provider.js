const wcpshared = require("@wcp/wcpshared");
const logger = require('../logging');

const ReduceArrayToMapByKey = function(xs, key) {
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
const CatalogMapGenerator = (categories, products, product_instances) => {
  const category_map = {};
  categories.forEach((curr) => {
    category_map[curr._id] = { category: curr, children: [], products: [] };
  });
  for (var i = 0; i < categories.length; ++i) {
    if (categories[i].parent_id.length > 0) {
      category_map[categories[i].parent_id].children.push(categories[i]._id);
    }
  }
  const product_map = {};
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

const ModifierTypeMapGenerator = (modifier_types, options) => {
  var modifier_types_map = {};
  modifier_types.forEach(mt => {
    modifier_types_map[mt._id] = { options: [], modifier_type: mt } ;
  });
  options.forEach(o => {
    modifier_types_map[o.option_type_id].options.push(o);
  });
  return modifier_types_map;
};

const CatalogGenerator = (categories, modifier_types, options, products, product_instances, product_instance_functions, apiver) => {
  const modifier_types_map = ModifierTypeMapGenerator(modifier_types, options);
  const [category_map, product_map] = CatalogMapGenerator(categories, products, product_instances);
  return { 
    modifiers: modifier_types_map,
    categories: category_map,
    products: product_map,
    version: Date.now().toString(36).toUpperCase(),
    product_instance_functions: product_instance_functions,
    api: apiver,
  };
}

// const GenerateAbstractExpression = async (dbconn, expr) => {
//   console.log(expr);
//   const GenerateIfElse = async (ifElseExpr) => {
//     return new dbconn.WIfElse({
//       true_branch: await GenerateAbstractExpression(dbconn, ifElseExpr.true_branch),
//       false_branch: await GenerateAbstractExpression(dbconn, ifElseExpr.false_branch),
//       test: await GenerateAbstractExpression(dbconn, ifElseExpr.test)
//     });
//   }
//   const GenerateConstLiteral = async (constLiteralexpr) => {
//     return new dbconn.WConstLiteral({
//       value: constLiteralexpr.value
//     });
//   }
//   const GenerateModifierPlacementExtraction = async (modPlacementExpr) => {
//     return new dbconn.WModifierPlacementExtractionOperator({
//       mtid: modPlacementExpr.mtid,
//       moid: modPlacementExpr.moid
//     });
//   }
//   const GenerateLogicalOperator = async (logicalExpr) => {
//     console.log(logicalExpr);
//     return await new dbconn.WLogicalOperator({
//       operandA: logicalExpr.operandA ? await GenerateAbstractExpression(dbconn, logicalExpr.operandA) : null,
//       operandB: logicalExpr.operandB ? await GenerateAbstractExpression(dbconn, logicalExpr.operandB) : null,
//       operator: logicalExpr.operator
//     }).save();    
//   }

//   var ifElseExpr = null;
//   var constLiteralexpr = null;
//   var modPlacementExpr = null;
//   var logicalExpr = null;
//   console.log(`discrim: ${expr.discriminator}`);
//   switch (expr.discriminator) {
//     case 'ConstLiteral': 
//       constLiteralexpr = await GenerateConstLiteral(expr.const_literal); 
//       break;
//     case 'IfElse': 
//       ifElseExpr = await GenerateIfElse(expr.if_else); 
//       break;
//     case 'Logical': 
//       logicalExpr = await GenerateLogicalOperator(expr.logical); 
//       break;
//     case 'ModifierPlacement': 
//       modPlacementExpr = await GenerateModifierPlacementExtraction(expr.modifier_placement);
//       break;
//     default:
//       throw "No discriminator!";
//   }
//   return await new dbconn.WAbstractExpression({
//     const_literal: constLiteralexpr ? constLiteralexpr._id : null,
//     if_else: ifElseExpr ? ifElseExpr._id : null,
//     logical: logicalExpr ? logicalExpr._id : null,
//     modifier_placement: modPlacementExpr ? modPlacementExpr._id : null,
//     discriminator: expr.discriminator
//   }).save();  
// }

class CatalogProvider {
  #dbconn;
  #socketRO;
  #categories;
  #modifier_types;
  #options;
  #products;
  #product_instances;
  #product_instance_functions;
  #catalog;
  #apiver;
  constructor(dbconn, socketRO) {
    this.#dbconn = dbconn;
    this.#socketRO = socketRO;
    this.#categories = [];
    this.#modifier_types = [];
    this.#options = [];
    this.#products = [];
    this.#product_instances = [];
    this.#product_instance_functions = [];
    this.#apiver = { major: 0, minor: 0, patch: 0};
    this.#catalog = CatalogGenerator([], [], [], [], []);
    
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

  SyncCategories = async () => {
    // categories
    try {
      this.#categories = await this.#dbconn.WCategorySchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching categories with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncModifierTypes = async () => {
    // option types
    try {
      this.#modifier_types = await this.#dbconn.WOptionTypeSchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching option types with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncOptions = async () => {
    // options
    try {
      this.#options = await this.#dbconn.WOptionSchema.find().populate("enable_function").exec();
    } catch (err) {
      logger.error(`Failed fetching options with error: ${JSON.stringify(err)}`);
      return false;
    }    
    return true;
  }

  SyncProducts = async () => {
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
    // product instances
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

  CreateCategory = async ({description, name, ordinal, parent_id, subheading}) => {
    const doc = new this.#dbconn.WCategorySchema({
      description: description,
      name: name,
      ordinal: ordinal,
      parent_id: parent_id,
      subheading: subheading
    });
    await doc.save();
    await this.SyncCategories();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateCategory = async ( category_id, {name, description, ordinal, subheading, parent_id}) => {
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
        while (cur && category_id_map[cur].parent_id != category_id)
        {
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
      return null 
    }
  };

  DeleteCategory = async ( category_id ) => {
    logger.debug(`Removing ${category_id}`);
    try {
      const doc = await this.#dbconn.WCategorySchema.findByIdAndDelete(category_id);
      if (!doc) {
        return null;
      }
      this.#categories.forEach(async (cat) => {
        if (cat.parent_id && cat.parent_id === category_id) {
          cat.parent_id = "";
          await cat.save();
        }
      });
      const products_update = await this.#dbconn.WProductSchema.updateMany({}, { $pull: {category_ids: category_id }} );
      if (products_update.nModified > 0) {
        logger.debug(`Removed Category ID from ${products_update.nModified} products.`);
        await this.SyncProducts();
      }
      await this.SyncCategories();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
      return null;
    }
  }

  CreateModifierType = async ({name, ordinal, min_selected, max_selected, revelID, squareID, display_flags}) => {
    const doc = new this.#dbconn.WOptionTypeSchema({
      name: name,
      ordinal: ordinal,
      min_selected: min_selected, 
      max_selected: max_selected, 
      externalIDs: {
        revelID: revelID,
        squareID: squareID
      },
      display_flags
    });
    await doc.save();
    await this.SyncModifierTypes();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateModifierType = async ( mt_id, {name, ordinal, min_selected, max_selected, revelID, squareID, display_flags}) => {
    try {
      const updated = await this.#dbconn.WOptionTypeSchema.findByIdAndUpdate(
        mt_id, 
        {
          name: name,
          ordinal: ordinal,
          min_selected: min_selected, 
          max_selected: max_selected, 
          externalIDs: {
            revelID: revelID,
            squareID: squareID
          },
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
      return null 
    }
  };

  DeleteModifierType = async ( mt_id ) => {
    logger.debug(`Removing ${mt_id}`);
    try {
      const doc = await this.#dbconn.WOptionTypeSchema.findByIdAndDelete(mt_id);
      if (!doc) {
        return null;
      }
      const options_delete = await this.#dbconn.WOptionSchema.deleteMany({ option_type_id: mt_id});
      if (options_delete.deletedCount > 0) {
        logger.debug(`Removed ${options_delete.deletedCount} Options from the catalog.`);
      }
      const products_update = await this.#dbconn.WProductSchema.updateMany({}, { $pull: {modifiers: mt_id }} );
      if (products_update.nModified > 0) {
        const product_instance_update = await this.#dbconn.WProductInstanceSchema.updateMany({}, {$pull: {modifiers: {modifier_type_id: mt_id}}});
        logger.debug(`Removed ModifierType ID from ${products_update.nModified} products, ${product_instance_update.nModified} product instances.`);
        await this.SyncProducts();
        await this.SyncProductInstances();
      }
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
    revelID, 
    squareID, 
    ordinal, 
    flavor_factor, 
    bake_factor, 
    can_split, 
    enable_function,
  }) => {
    // first find the Modifier Type ID in the catalog
    var option_type = this.#modifier_types.find(x => x._id.toString() === option_type_id);
    if (!option_type) {
      return null;
    }

    const doc = new this.#dbconn.WOptionSchema({
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
        externalIDs: {
          revelID: revelID,
          squareID: squareID
        }
      },
      option_type_id: option_type_id,
      ordinal: ordinal,
      metadata: {
        flavor_factor: flavor_factor,
        bake_factor: bake_factor,
        can_split: can_split,
      },
      enable_function: enable_function
    });    
    await doc.save();
    await this.SyncOptions();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateModifierOption = async ( mo_id, {
    //mt_id, 
    display_name, 
    description, 
    price, 
    shortcode, 
    disabled, 
    revelID, 
    squareID, 
    ordinal, 
    flavor_factor, 
    bake_factor, 
    can_split, 
    enable_function}) => {
    try {
       //TODO: post update: rebuild all products with the said modifier option since the ordinal might have changed
       // 
      const updated = await this.#dbconn.WOptionSchema.findByIdAndUpdate(
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
            externalIDs: {
              revelID: revelID,
              squareID: squareID
            }
          },
          ordinal: ordinal,
          metadata: {
            flavor_factor: flavor_factor,
            bake_factor: bake_factor,
            can_split: can_split,
          },
          enable_function: enable_function
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
      return null 
    }
  };

  DeleteModifierOption = async ( mo_id ) => {
    logger.debug(`Removing Modifier Option ${mo_id}`);
    try {
      const doc = await this.#dbconn.WOptionSchema.findByIdAndDelete(mo_id);
      if (!doc) {
        return null;
      }
      const product_instance_options_delete = await this.#dbconn.WOptionSchema.updateMany({},
        { modifiers: {$pull: {  option_id: mo_id } } } );
      console.log(product_instance_options_delete);
      if (product_instance_options_delete.nModified > 0) {
        logger.debug(`Removed ${product_instance_options_delete.nModified} Options from Product Instances.`);
        await this.SyncProductInstances();
      }
      await this.SyncOptions();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
      return null;
    }
  }

  CreateProduct = async ({
    display_name, 
    description, 
    price, 
    shortcode, 
    disabled, 
    display_flags,
    ordinal, 
    revelID, 
    squareID, 
    modifiers,
    category_ids
  }) => {
    // first find the Modifier Type IDs in the catalog
    const found_all_modifiers = modifiers.map(mtid => this.#modifier_types.some(x => x._id.toString() === mtid)).every(x => x === true);
    const found_all_categories = category_ids.map(cid => this.#categories.some(x => x._id.toString() === cid)).every(x => x === true);
    if (!found_all_categories || !found_all_modifiers) {
      return null;
    }

    const doc = new this.#dbconn.WProductSchema({
      item: {
        price: price,
        description: description,
        display_name: display_name,
        shortcode: shortcode,
        disabled: disabled,
        permanent_disable: false,
        ordinal: ordinal,
        externalIDs: {
          revelID: revelID,
          squareID: squareID
        }
      },
      display_flags,
      modifiers: modifiers,
      category_ids: category_ids
    });    
    await doc.save();
    await this.SyncProducts();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateProduct = async ( pid, {
    display_name, 
    description, 
    price, 
    shortcode, 
    disabled, 
    display_flags,
    ordinal, 
    revelID, 
    squareID, 
    modifiers,
    category_ids}) => {
    try {
      const updated = await this.#dbconn.WProductSchema.findByIdAndUpdate(
        pid, 
        {
          item: {
            price: price,
            description: description,
            display_name: display_name,
            shortcode: shortcode,
            disabled: disabled,
            permanent_disable: false,
            ordinal: ordinal,
            externalIDs: {
              revelID: revelID,
              squareID: squareID
            }
          },
          display_flags,
          modifiers: modifiers,
          category_ids: category_ids
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }

      await this.SyncProducts();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProduct = async ( p_id ) => {
    logger.debug(`Removing Product ${p_id}`);
    try {
      const doc = await this.#dbconn.WProductSchema.findByIdAndDelete(p_id);
      if (!doc) {
        return null;
      }
      const product_instance_delete = await this.#dbconn.WProductInstanceSchema.deleteMany({ product_id: p_id});
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
    price, 
    description, 
    display_name,
    shortcode, 
    disabled, 
    ordinal, 
    revelID, 
    squareID, 
    modifiers,
    is_base,
    display_flags
  }) => {
    const doc = new this.#dbconn.WProductInstanceSchema({
      product_id: parent_product_id,
      item: {
        price: price,
        description: description,
        display_name: display_name,
        shortcode: shortcode,
        disabled: disabled,
        permanent_disable: false,
        externalIDs: {
          revelID: revelID,
          squareID: squareID
        }
      },
      ordinal: ordinal,
      modifiers: modifiers,
      is_base,
      display_flags
    });    
    await doc.save();
    await this.SyncProductInstances();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateProductInstance = async ( pid, piid, {
    display_name, 
    description, 
    price, 
    shortcode, 
    disabled, 
    ordinal, 
    revelID, 
    squareID, 
    modifiers,
    is_base,
    display_flags
  }) => {
    try {
      const updated = await this.#dbconn.WProductInstanceSchema.findByIdAndUpdate(
        piid, 
        {
          product_id: pid,
          item: {
            price: price,
            description: description,
            display_name: display_name,
            shortcode: shortcode,
            disabled: disabled,
            permanent_disable: false,
            externalIDs: {
              revelID: revelID,
              squareID: squareID
            }
          },
          ordinal: ordinal,
          modifiers: modifiers,
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

  DeleteProductInstance = async ( pi_id ) => {
    logger.debug(`Removing ${pi_id}`);
    try {
      const doc = await this.#dbconn.WProductInstanceSchema.findByIdAndDelete(pi_id);
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
    const doc = new this.#dbconn.WProductInstanceFunction({
      name: name,
      expression: expression//await GenerateAbstractExpression(this.#dbconn, expression)
    });    
    await doc.save();
    await this.SyncProductInstanceFunctions();
    this.RecomputeCatalog();
    this.EmitCatalog(this.#socketRO);
    return doc;
  };

  UpdateProductInstanceFunction = async ( pif_id, {
    name, 
    expression
  }) => {
    try {
      const updated = await this.#dbconn.WProductInstanceFunction.findByIdAndUpdate(
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
  
      await this.SyncProductInstanceFunctions();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  DeleteProductInstanceFunction = async ( pif_id ) => {
    logger.debug(`Removing ${pif_id}`);
    try {
      const doc = await this.#dbconn.WProductInstanceFunction.findByIdAndDelete(pif_id);
      if (!doc) {
        return null;
      }
      const options_update = await this.#dbconn.WOptionSchema.updateMany(
        { enable_function: pif_id }, 
        { $unset: { "enable_function": ""} });
      if (options_update.nModified > 0) {
        logger.debug(`Removed ${doc} from ${options_update.nModified} Modifier Options.`);
        await this.SyncOptions();
      }
      await this.SyncProductInstanceFunctions();
      this.RecomputeCatalog();
      this.EmitCatalog(this.#socketRO);
      return doc;
    } catch (err) {
      throw err;
    }
  }
}



module.exports = ({ dbconn, socketRO, socketAUTH }) => {
  return new CatalogProvider(dbconn, socketRO, socketAUTH);
}