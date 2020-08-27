const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WConstLiteral = new Schema({
  value: Schema.Types.Mixed
});

module.exports = WConstLiteral;