const WDateUtils = require("@wcp/wcpshared");
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
  })
  return modifier_types_map;
};

const CatalogGenerator = (categories, modifier_types, options, products, product_instances) => {
  const modifier_types_map = ModifierTypeMapGenerator(modifier_types, options);
  const [category_map, product_map] = CatalogMapGenerator(categories, products, product_instances);
  return { 
    modifiers: modifier_types_map,
    categories: category_map,
    products: product_map
  };
}


class CatalogProvider {
  #dbconn;
  #socketRO;
  #categories;
  #option_types;
  #options;
  #products;
  #product_instances;
  #catalog;
  constructor(dbconn, socketRO) {
    this.#dbconn = dbconn;
    this.#socketRO = socketRO;
    this.#categories = [];
    this.#option_types = [];
    this.#options = [];
    this.#products = [];
    this.#product_instances = [];
    this.#catalog = CatalogGenerator([], [], [], [], []);
  }

  get Categories() {
    return this.#categories;
  }

  get ModifierTypes() {
    return this.#option_types;
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

  SyncOptionTypes = async () => {
    // option types
    try {
      this.#option_types = await this.#dbconn.WOptionTypeSchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching option types with error: ${JSON.stringify(err)}`);
      return false;
    }
    return true;
  }

  SyncOptions = async () => {
    // options
    try {
      this.#options = await this.#dbconn.WOptionSchema.find().exec();
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

  EmitCatalog = () => {
    this.#socketRO.emit('WCP_CATALOG', this.#catalog);
  }

  RecomputeCatalog = () => {
    this.#catalog = CatalogGenerator(this.#categories, this.#option_types, this.#options, this.#products, this.#product_instances);
  }

  Bootstrap = async () => {

    // load catalog from DB, do not push to clients as that'll be handled when a new client connects
    logger.info("Loading catalog from database...");

    await this.SyncCategories();

    await this.SyncOptionTypes();
    
    await this.SyncOptions();
    
    await this.SyncProducts();

    await this.SyncProductInstances();

    this.RecomputeCatalog();
  };

  CreateCategory = async ({description, name, parent_id}) => {
    const doc = new this.#dbconn.WCategorySchema({
      description: description,
      name: name,
      parent_id: parent_id
    });
    await doc.save();
    await this.SyncCategories();
    this.RecomputeCatalog();
    this.EmitCatalog();
    return doc;
  };

  UpdateCategory = async ( category_id, {description, name, parent_id}) => {
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
      await category_id_map[category_id].save();
      if (cycle_update_promise) {
        await cycle_update_promise;
      }
      await this.SyncCategories();
      this.RecomputeCatalog();
      this.EmitCatalog();
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
      var must_sync_products = false;
      this.#products.forEach(async (prod) => {
        if (prod.category_ids) {
          const old_length = prod.category_ids.length;
          logger.debug(`previous list: ${prod.category_ids}, deleting ${category_id}`);
          prod.category_ids = prod.category_ids.filter(x => x !== category_id);
          console.log(`after list: ${prod.category_ids}`);
          if (prod.category_ids.length < old_length) {
            logger.debug(`updating product: ${prod}`);
            must_sync_products = true;
            await prod.save();
          }
        }
      })
      if (must_sync_products) {
        await this.SyncProducts();
      }
      await this.SyncCategories();
      this.RecomputeCatalog();
      this.EmitCatalog();
      return doc;
    } catch (err) {
      throw err;
      return null 
    }
  }

  CreateOptionType = async ({name, ordinal, selection_type, revelID, squareID}) => {
    const newoptiontype = new this.#dbconn.WOptionTypeSchema({
      name: name,
      ordinal: ordinal,
      selection_type: selection_type,
      externalIDs: {
        revelID: revelID,
        squareID: squareID
      }
    });
    await newoptiontype.save();
    await this.SyncOptionTypes();
    this.RecomputeCatalog();
    this.EmitCatalog();
    return newoptiontype;
  };

  UpdateModifierType = async ( mt_id, {name, ordinal, selection_type, revelID, squareID}) => {
    try {
      const updated = await this.#dbconn.WOptionTypeSchema.findByIdAndUpdate(
        mt_id, 
        {
          name: name,
          ordinal: ordinal,
          selection_type: selection_type,
          externalIDs: {
            revelID: revelID,
            squareID: squareID
          }
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncOptionTypes();
      this.RecomputeCatalog();
      this.EmitCatalog();
      return updated;
    } catch (err) {
      throw err;
      return null 
    }
  };

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
    enable_function_name
  }) => {
    // first find the Modifier Type ID in the catalog
    var option_type = this.#option_types.find(x => x._id.toString() === option_type_id);
    if (!option_type) {
      return null;
    }

    const doc = new this.#dbconn.WOptionSchema({
      catalog_item: {
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
      enable_function_name: enable_function_name
    });    
    await doc.save();
    await this.SyncOptions();
    this.RecomputeCatalog();
    this.EmitCatalog();
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
    enable_function_name}) => {
    try {
      const updated = await this.#dbconn.WOptionSchema.findByIdAndUpdate(
        mo_id, 
        {
          catalog_item: {
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
          //option_type_id: mt_id, // don't take this param, since we don't support changing parent at this time
          ordinal: ordinal,
          metadata: {
            flavor_factor: flavor_factor,
            bake_factor: bake_factor,
            can_split: can_split,
          },
          enable_function_name: enable_function_name
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
      await this.SyncOptions();
      this.RecomputeCatalog();
      this.EmitCatalog();
      return updated;
    } catch (err) {
      throw err;
      return null 
    }
  };

  CreateProduct = async ({
    display_name, 
    description, 
    price, 
    shortcode, 
    disabled, 
    revelID, 
    squareID, 
    modifiers,
    category_ids
  }) => {
    // first find the Modifier Type IDs in the catalog
    const found_all_modifiers = modifiers.map(mtid => this.#option_types.some(x => x._id.toString() === mtid)).every(x => x === true);
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
        externalIDs: {
          revelID: revelID,
          squareID: squareID
        }
      },
      modifiers: modifiers,
      category_ids: category_ids
    });    
    await doc.save();
    await this.SyncProducts();
    this.RecomputeCatalog();
    this.EmitCatalog();
    return doc;
  };

  UpdateProduct = async ( pid, {
    display_name, 
    description, 
    price, 
    shortcode, 
    disabled, 
    revelID, 
    squareID, 
    modifiers,
    category_ids}) => {
    try {
      // maybe we don't actually have to sync to the DB here, but if not, 
      // then we need to remove the sync in the category update method
      // await this.SyncOptionTypes();

      //const products_map = ReduceArrayToMapByKey(this.#products, "_id");
      // const product_to_update = products_map[pid];

      // if (!product_to_update) {
      //   return null;
      // }

      //TODO: check that modifiers haven't changed
      //if (product_to_update.modifiers) ...
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
            externalIDs: {
              revelID: revelID,
              squareID: squareID
            }
          },
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
      this.EmitCatalog();
      return updated;
    } catch (err) {
      throw err;
      return null 
    }
  };
  
  CreateProductInstance = async (parent_product_id, {
    price, 
    description, 
    display_name,
    shortcode, 
    disabled, 
    revelID, 
    squareID, 
    modifiers
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
      modifiers: modifiers
    });    
    await doc.save();
    await this.SyncProductInstances();
    this.RecomputeCatalog();
    this.EmitCatalog();
    return doc;
  };

  UpdateProductInstance = async ( pid, piid, {
    display_name, 
    description, 
    price, 
    shortcode, 
    disabled, 
    revelID, 
    squareID, 
    modifiers}) => {
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
          modifiers: modifiers,
        },
        { new: true }
      ).exec();
      if (!updated) {
        return null;
      }
  
      await this.SyncProductInstances();
      this.RecomputeCatalog();
      this.EmitCatalog();
      return updated;
    } catch (err) {
      throw err;
      return null 
    }
  };
  
}

module.exports = ({ dbconn, socketRO, socketAUTH }) => {
  return new CatalogProvider(dbconn, socketRO, socketAUTH);
}