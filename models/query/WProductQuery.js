const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WAbstractExpression = require("./WAbstractExpression");

const WProductInstanceFunction = new Schema({
  function: WAbstractExpression;
});

module.exports = WProductInstanceFunction;