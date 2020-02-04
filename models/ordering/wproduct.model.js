const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var WProductSchema = new Schema({
  // To depreciate?
  shortcode: String,
  // Nice, long description of the product
  // eg: House-ground spicy pork sausage
  description: String,
  // Nice name of the product
  // eg: House Sausage
  display_name: String,
  // Moneys
  price: Number,
  // ID to use in external applications
  external_id: String,
  // optional function name to call to enable this product, 
  // always enabled if not specified
  enable_function_name: String
});

module.exports = mongoose.model("WProductSchema", WProductSchema);
