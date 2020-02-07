const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WProductSchema = require("./wproduct.model");
const logger = require('../../logging');

const CHEESE_OPTIONS = [];
const SAUCE_OPTIONS = [];
const WCP_TOPPING_OPTIONS = [];

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
    enum: ['CHEESE', 'CRUST', 'WCP_TOPPING', 'SAUCE', 'MODIFIER']
  }
});

WOptionSchema.find({ option_type: 'CHEESE' }, (err, docs) => {
  if (err || !docs || !docs.length) {
    //CHEESE_OPTIONS.push(new WOptionSchema());
    const CHEESE_DEFAULTS = require("../../data/ordering/woption.cheese.wcp.default.json");
  }
  else {
    // found cheese options
    CHEESE_OPTIONS = docs;
  }
}).then(x => { });

WOptionSchema.find({ option_type: 'SAUCE' }, (err, docs) => {
  if (err || !docs || !docs.length) {
    const SAUCE_DEFAULTS = require("../../data/ordering/woption.sauce.wcp.default.json");
    //SAUCE_OPTIONS.push(new WOptionSchema());
  }
  else {
    // found sauce options
    SAUCE_OPTIONS = docs;
  }
}).then(x => { });

WOptionSchema.find({ option_type: 'WCP_TOPPING' }, (err, docs) => {
  if (err || !docs || !docs.length) {
    var idx = 0;

  }
  else {
    // found wcp toppings options
    WCP_TOPPING_OPTIONS = docs;
  }
}).then(x => { });

module.exports = mongoose.model("WOptionSchema", WOptionSchema);
