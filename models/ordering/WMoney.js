const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// NOTE: this is a mix-in and probably won't be instantiated directly
var WMoney = new Schema({
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    enum: ['USD'],
    required: true
  }
});

module.exports = WMoney;
