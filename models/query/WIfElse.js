const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WAbstractExpression = require("./WAbstractExpression");

const WIfElse = new Schema({
  true_branch: WAbstractExpression,
  false_branch: WAbstractExpression,
  test: WAbstractExpression
});

module.exports = WIfElse;