const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const ExternalIDsSchema = require("./ExternalIDsSchema");
const WMoney = require("./WMoney");

// NOTE: this is a mix-in and probably won't be instantiated directly
var WCatalogItemSchema = new Schema({
  // Nice name of the product
  // eg: House Sausage
  display_name: {
    type: String,
    required: true 
  },

  // Nice, long description of the product
  // eg: House-ground spicy pork sausage
  // This is displayed alongside any modifiers for the product
  // HTML allowed
  description: String,

  // abbreviation used in store
  shortcode: {
    type: String,
    required: true 
  },

  // Moneys in base currency unit (300 is $3)
  price: { 
    type: WMoney,
    required: true
  },

  // external ids
  externalIDs: {
    type: ExternalIDsSchema,
    required: true
  },

  // flag to temporarily turn off this product and any products that contain this
  // start and end are epoch times in the local timezone
  // special values: 
  //   start > end means generally disabled
  //   disabled not defined: means enabled
  disabled: {
    start: Number,
    end: Number
  },

  // flag to PERMANENTLY turn off this product, roughly equivalent to a deletion,
  // but not because we want to be able to be able to reference the product later on
  permanent_disable: Boolean
}, { _id: false});

module.exports = WCatalogItemSchema;
