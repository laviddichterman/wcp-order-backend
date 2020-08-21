const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var WConstLiteral = new Schema({
  value: Schema.Types.Mixed;
});

module.exports = WConstLiteral;