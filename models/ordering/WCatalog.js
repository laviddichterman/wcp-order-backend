const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WCategorySchema = require("./category/WCategorySchema");
const WOptionTypeSchema = require("./options/WOptionTypeSchema");
const WOptionSchema = require("./options/WOptionSchema");
const WProductSchema = require("./products/WProductSchema");
const WProductInstanceSchema = require("./products/WProductInstanceSchema");

var WCatalog = new Schema({
  version: String,
  // modifiers: [modifier_type_id: String,  }
  // return { 
  //   modifiers: modifier_types_map,
  //   categories: category_map,
  //   products: product_map,
  //   version: Date.now().toString(36).toUpperCase()
  // };
  // amount: {
  //   type: Number,
  //   required: true
  // },
  // currency: {
  //   type: String,
  //   enum: ['USD'],
  //   required: true
  // }
});

module.exports = WCatalog;
