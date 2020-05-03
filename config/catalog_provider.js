const WDateUtils = require("@wcp/wcpshared");
const logger = require('../logging');


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

  EmitCategories = () => {
    this.#socketRO.emit('WCP_CATALOG_CATEGORIES', this.#categories);
  }

  Bootstrap = async () => {

    // load catalog from DB, do not push to clients as that'll be handled when a new client connects
    logger.info("Loading catalog from database...");

    await this.SyncCategories();

    // option types
    try {
      this.#option_types = await this.#dbconn.WOptionTypeSchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching option types with error: ${JSON.stringify(err)}`);
    }
    
    // options
    try {
      this.#options = await this.#dbconn.WOptionSchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching options with error: ${JSON.stringify(err)}`);
    }
    
    //products
    try {
      this.#products = await this.#dbconn.WProductSchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching products with error: ${JSON.stringify(err)}`);
    }

    // product instances
    try {
      this.#product_instances = await this.#dbconn.WProductInstanceSchema.find().exec();
    } catch (err) {
      logger.error(`Failed fetching product instances with error: ${JSON.stringify(err)}`);
    }

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
      this.#dbconn.WCategorySchema.findByIdAndUpdate(
      category_id,
      { name, description, parent_id },
      { new: true }).exec();
    } catch (err) {
      return false;
    }
    await this.SyncCategories();
    this.EmitCategories();
    return true;
  };

}

module.exports = ({ dbconn, socketRO, socketAUTH }) => {
  return new CatalogProvider(dbconn, socketRO, socketAUTH);
}