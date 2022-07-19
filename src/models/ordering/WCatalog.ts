import {Schema} from "mongoose";

// import WCategorySchema from "./category/WCategorySchema";
// import WOptionTypeSchema = require("./options/WOptionTypeSchema";
// import WOptionSchema = require("./options/WOptionSchema";
// import WProductSchema = require("./products/WProductSchema";
// import WProductInstanceSchema = require("./products/WProductInstanceSchema";

export const WCatalog = new Schema({
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
