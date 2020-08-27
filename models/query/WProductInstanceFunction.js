const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WAbstractExpression = require("./WAbstractExpression");

const WProductInstanceFunction = new Schema({
  expression: WAbstractExpression,
  name: String
});

module.exports = WProductInstanceFunction;