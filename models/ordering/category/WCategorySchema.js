const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var WCategorySchema = new Schema({
  // brief name of the category
  name: String,

  // longer, optional description of the category
  description: String,

  // parent category ID if any
  parent_id: String
});

module.exports = WCategorySchema;
