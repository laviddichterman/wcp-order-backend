const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WOptionInstanceSchema = require("../options/WOptionInstanceSchema");
const WCatalogItemSchema = require("../WCatalogItemSchema");

const WProductInstanceSchema = new Schema({
  // reference to the WProductSchema ID for this class of item
  product_id: String,

  // applied modifiers for this instance of the product
  modifiers: [{ 
    modifier_type_id: String,
    options: [WOptionInstanceSchema]
  }],
  
  // optional catalog data if this is a catalog item
  // should allow for specific configurations of products (pizza) to be added and referenced directly in the catalog
  item: WCatalogItemSchema
});

module.exports = WProductInstanceSchema;
