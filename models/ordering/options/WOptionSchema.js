const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WCatalogItemSchema = require("../WCatalogItemSchema");
const WProductInstanceFunction = require("../../query/WProductInstanceFunction");

var WOptionSchema = new Schema({
  // inheritance by composition
  // the base catalog item
  item: { 
    type: WCatalogItemSchema, 
    required: true 
  },

  catalog_item: WCatalogItemSchema,

  // placement index
  ordinal: {
    type: Number,
    required: true
  },

  // option type enumeration
  option_type_id: {
    type: String,
    required: true
  },

  metadata: {
    // how much this contributes to the flavor
    flavor_factor: Number,

    // how much weight/moisture this contributes
    bake_factor: Number,

    // boolean flag representing if the option can be split left/right
    can_split: Boolean,
  },

  // optional function name to call to enable this product, 
  // always enabled if not specified
  enable_function_name: String,

  // optional function object that operates on a product instance
  // and returns true if the option should be enabled.
  enable_function: WProductInstanceFunction,
});

module.exports = WOptionSchema;