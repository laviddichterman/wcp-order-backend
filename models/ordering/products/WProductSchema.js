const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WCatalogItemSchema = require("../WCatalogItemSchema");

const ProductModifierSchema = new Schema({ 
  mtid: { type: Schema.Types.ObjectId, ref: 'WOptionTypeSchema' }, 
  // optional function object that operates on a product instance
  // and returns true if the option type should be enabled.
  enable: { type: Schema.Types.ObjectId, ref: 'WProductInstanceFunction', autopopulate: true } 
}, { _id: false });


// represents a class of products that can be made and inserted into the catalog
var WProductSchema = new Schema({

  item: { 
    type: WCatalogItemSchema,
    required: true 
  },

  // this can probably go away
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

  // list of option type IDs and nullable product instance function IDs
  modifiers: [ProductModifierSchema],
  
  // Corresponding to a WCategorySchema
  category_ids: [String],
});

WProductSchema.plugin(require('mongoose-autopopulate'));


module.exports = WProductSchema;
