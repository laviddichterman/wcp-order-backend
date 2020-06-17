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

class CatalogProvider {
  #dbconn;
  #socketRO;
  #categories;
  #option_types;
  #options;
  #products;
  #product_instances;
  constructor(dbconn, socketRO) {
    this.#dbconn = dbconn;
    this.#socketRO = socketRO;
    this.#categories = [];
    this.#option_types = [];
    this.#options = [];
    this.#products = [];
    this.#product_instances = [];
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

  EmitCategories = () => {
    this.#socketRO.emit('WCP_CATALOG_CATEGORIES', this.#categories);
  }
  EmitOptionTypes = () => {
    this.#socketRO.emit('WCP_CATALOG_OPTION_TYPES', this.#option_types);
  }
  EmitOptions = () => {
    this.#socketRO.emit('WCP_CATALOG_OPTIONS', this.#options);
  }
  EmitProducts = () => {
    this.#socketRO.emit('WCP_CATALOG_PRODUCTS', this.#products);
  }
  EmitProductInstances = () => {
    this.#socketRO.emit('WCP_CATALOG_PRODUCT_INSTANCES', this.#product_instances);
  }

  EmitAll = () => {
    this.EmitCategories();
    this.EmitOptionTypes();
    this.EmitProducts();
    this.EmitProductInstances();
    this.EmitOptions();    
  }

  Bootstrap = async () => {

    // load catalog from DB, do not push to clients as that'll be handled when a new client connects
    logger.info("Loading catalog from database...");

    await this.SyncCategories();

    await this.SyncOptionTypes();
    
    await this.SyncOptions();
    
    await this.SyncProducts();

    await this.SyncProductInstances();

    // some sort of put together version of the catalog?
  };

  CreateCategory = async ({description, name, parent_id}) => {
    const newcategory = new this.#dbconn.WCategorySchema({
      description: description,
      name: name,
      parent_id: parent_id
    });
    await newcategory.save();
    await this.SyncCategories();
    this.EmitCategories();
    return newcategory;
  };

  UpdateCategory = async ( category_id, {description, name, parent_id}) => {
    try {
      // make sure the categories are sync'd
      await this.SyncCategories();
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
      this.EmitCategories();
      // is this going to still be valid after the Sync above?
      return category_id_map[category_id];
    } catch (err) {
      throw err;
      return null 
    }
  };

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
    this.EmitOptionTypes();
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
      this.EmitOptionTypes();
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

    const newoption = new this.#dbconn.WOptionSchema({
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
    await newoption.save();
    await this.SyncOptions();
    this.EmitOptions();
    return newoption;
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
      this.EmitOptions();
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
    const newproduct = new req.db.WProductSchema({
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
      modifiers: modifiers,
      category_ids: category_ids
    });    
    await newproduct.save();
    await this.SyncProducts();
    this.EmitProducts();
    return newproduct;
  };
  
  CreateProductInstance = async ({
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
    console.error("THIS SHIT AINT READY");
    const newproductinstance = new req.db.WProductInstanceSchema({
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
      modifiers: modifiers,
      category_ids: category_ids
    });    
    await newproductinstance.save();
    await this.SyncProductInstances();
    this.EmitProductInstances();
    return newproductinstance;
  };
  
}

module.exports = ({ dbconn, socketRO, socketAUTH }) => {
  return new CatalogProvider(dbconn, socketRO, socketAUTH);
}