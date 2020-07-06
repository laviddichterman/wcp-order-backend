const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WCatalogItemSchema = require("../WCatalogItemSchema");

// represents a class of products that can be made and inserted into the catalog
var WProductSchema = new Schema({

  item: { 
    type: WCatalogItemSchema,
    required: true 
  },

  // ordinal
  ordinal: { type: Number, required: true }, 

  modifiers: [String], // list of option_type_ids

  // Corresponding to a WCategorySchema
  category_ids: [String],
});


module.exports = WProductSchema;
