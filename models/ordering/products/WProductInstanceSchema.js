const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WOptionInstanceSchema = require("../options/WOptionInstanceSchema");
const WCatalogItemSchema = require("../WCatalogItemSchema");
const WPriceDisplayEnumSchema = require("../WPriceDisplayEnumSchema");

const WProductInstanceSchema = new Schema({
  // reference to the WProductSchema ID for this class of item
  product_id: String,

  // ordinal for product matching
  ordinal: Number,

  // applied modifiers for this instance of the product
  modifiers: [{ 
    modifier_type_id: String,
    options: [WOptionInstanceSchema]
  }],
  
  // flag to note that this product instance is the "default" form of the product to which all others should be compared
  is_base: Boolean,

  display_flags: {
    menu: {
      // ordering within this product instance's category in menu page
      ordinal: Number,
      // flag to hide this from the menu
      hide: Boolean,
      // governs how prices get displayed in the menu page according to the enum      
      price_display: WPriceDisplayEnumSchema,
      // HTML-friendly message wrapping the display of this PI in the menu page
      adornment: String,
      // suppress the default pizza functionality where the full modifier list is surfaced on the product display
      // and instead use the templating strings to determine what is/isn't displayed
      suppress_exhaustive_modifier_list: Boolean
    },
    order: {
      // ordering within this product instance's category in order page
      ordinal: Number,
      // flag to hide this from the ordering page
      hide: Boolean,
      // flag to skip going right to customization when the user adds this to their order
      skip_customization: Boolean,
      // governs how prices get displayed in the order page according to the enum
      price_display: WPriceDisplayEnumSchema,
      // HTML-friendly message wrapping the display of this PI in the order page
      adornment: String,
      // suppress the default pizza functionality where the full modifier list is surfaced on the product display
      // and instead use the templating strings to determine what is/isn't displayed
      suppress_exhaustive_modifier_list: Boolean
    },
    // deprecated
    hide_from_menu: Boolean,
    // deprecated
    skip_customization: Boolean,
    // deprecated
    menu_adornment: String,
    // deprecated
    price_display: WPriceDisplayEnumSchema,
    // deprecated
    suppress_exhaustive_modifier_list: Boolean
  },

  // optional catalog data if this is a catalog item
  // should allow for specific configurations of products (pizza) to be added and referenced directly in the catalog
  item: WCatalogItemSchema
});

module.exports = WProductInstanceSchema;
