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
  ordinal: Number, 
  
  display_flags: {
    flavor_max: Number,
    bake_max: Number,
    bake_differential: Number,
    show_name_of_base_product: Boolean,
    singular_noun: String
  },

  // TODO: implement timing information across products and modifier options that
  // informs the prep time for the product and for any additional items
  timing: {
    min_prep_time: Number,
    additional_unit_prep_time: Number
  },

  modifiers: [String], // list of option_type_ids

  // Corresponding to a WCategorySchema
  category_ids: [String],
});


module.exports = WProductSchema;
