const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WMoney = require("../WMoney");

// represents a class of products that can be made and inserted into the catalog
var WStoreCredit = new Schema({
  code: { type: String, required: true },
  names: [String],
  initial_value: WMoney,
  balance: WMoney,
  associated_orders: [String],
  creation_date: String,
  last_used_date: String,
  //payment_info: 
});


module.exports = WStoreCredit;
