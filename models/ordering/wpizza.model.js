const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WProductSchema = require("./wproduct.model");
const WOptionSchema = require("./woption.model");

var WPizzaSchema = new Schema({
  // inheritance by composition
  product: WProductSchema,
  // crust selection
  crust: WOptionSchema,
  // sauce selection
  sauce: WOptionSchema,
  // cheese selection
  cheese: WOptionSchema,
  // toppings
  toppings: [WOptionSchema],
  // modifiers
  modifiers: [WOptionSchema]
});

module.exports = mongoose.model("WPizzaSchema", WOptionSchema);
