const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WHasAnyOfModifierType = new Schema({
  mtid: String
});

module.exports = WHasAnyOfModifierType;