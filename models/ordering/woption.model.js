const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WProductSchema = require("./wproduct.model");
const logger = require('../../logging');

const CHEESE_OPTIONS = [];
const SAUCE_OPTIONS = [];
const TOPPING_OPTIONS = [];

var WOptionSchema = new Schema({
  // inheritance by composition
  product: WProductSchema,
  // how much this contributes to the flavor
  flavor_factor: Number,
  // how much weight/moisture this contributes
  bake_factor: Number,
  // placement index
  index: Number,
  // option type enumeration
  option_type: {
    type: String,
    enum: [ 'CHEESE', 'CRUST', 'TOPPING', 'SAUCE', 'MODIFIER' ]
  }
});

WOptionSchema.find({option_type: 'CHEESE'}, (err, docs) => {
  if (err || !docs || !docs.length) {
    let REGULAR_CHEESE = new WOptionSchema({
      product: {
        shortcode: "regular",
        description: "Mozzarella Cheese",
        display_name: "Mozzarella",
        price: 0,
        external_id: "",
        enable_function_name: ""
      },
      flavor_factor: 0,
      bake_factor: 0,
      index: 0,
      option_type: "CHEESE"
    });
    let EXTRA_MOZZARELLA = new WOptionSchema({
      product: {
        shortcode: "ex_mozz",
        description: "Extra Mozzarella Cheese",
        display_name: "Extra Mozzarella",
        price: 2,
        external_id: "",
        enable_function_name: ""
      },
      flavor_factor: 0,
      bake_factor: 1,
      index: 0,
      option_type: "CHEESE"
    });
    CHEESE_OPTIONS.push(REGULAR_CHEESE);
    CHEESE_OPTIONS.push(EXTRA_MOZZARELLA);
  }
  else {
    // found cheese options
    CHEESE_OPTIONS = docs;
  }
}).then(x => { });

WOptionSchema.find({option_type: 'SAUCE'}, (err, docs) => {
  if (err || !docs || !docs.length) {
    let RED_SAUCE = new WOptionSchema({
      product: {
        shortcode: "red",
        description: "Red Sauce",
        display_name: "Red Sauce",
        price: 0,
        external_id: "",
        enable_function_name: ""
      },
      flavor_factor: 0,
      bake_factor: 0,
      index: 0,
      option_type: "SAUCE"
    });
    let WHITE_SAUCE = new WOptionSchema({
      product: {
        shortcode: "white",
        description: "White Sauce",
        display_name: "White Sauce",
        price: 2,
        external_id: "",
        enable_function_name: ""
      },
      flavor_factor: 0,
      bake_factor: 0,
      index: 0,
      option_type: "SAUCE"
    });
    SAUCE_OPTIONS.push(RED_SAUCE);
    SAUCE_OPTIONS.push(WHITE_SAUCE);
  }
  else {
    // found sauce options
    SAUCE_OPTIONS = docs;
  }
}).then(x => { });

module.exports = mongoose.model("WOptionSchema", WOptionSchema);
