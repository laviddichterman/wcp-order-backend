const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WCatalogItemSchema = require("./WCatalogItemSchema");

var WOptionSchema = new Schema({
  // id
  _id: { type: String, required: true },

  // inheritance by composition
  // the base catalog item
  catalog_item: { 
    type: WCatalogItemSchema, 
    required: true 
  },

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
});

module.exports = WOptionSchema;
