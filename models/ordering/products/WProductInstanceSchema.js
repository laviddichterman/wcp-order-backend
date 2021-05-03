const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WOptionInstanceSchema = require("../options/WOptionInstanceSchema");
const WCatalogItemSchema = require("../WCatalogItemSchema");

const WProductInstanceSchema = new Schema({
  // reference to the WProductSchema ID for this class of item
  product_id: String,

  // ordinal
  ordinal: Number,

  // applied modifiers for this instance of the product
  modifiers: [{ 
    modifier_type_id: String,
    options: [WOptionInstanceSchema]
  }],
  
  // flag to note that this product instance is the "default" form of the product to which all others should be compared
  is_base: Boolean,

  display_flags: {
    hide_from_menu: Boolean,
    skip_customization: Boolean,
    menu_adornment: String,
    price_display: {
      type: String,
      enum: ['FROM_X', 'VARIES', 'ALWAYS'],
      required: true
    },
    
    // suppress the default pizza functionality where the full modifier list is surfaced on the product display
    // and instead use the templating strings to determine what is/isn't displayed
    suppress_exhaustive_modifier_list: Boolean
  },

  // optional catalog data if this is a catalog item
  // should allow for specific configurations of products (pizza) to be added and referenced directly in the catalog
  item: WCatalogItemSchema
});

module.exports = WProductInstanceSchema;
