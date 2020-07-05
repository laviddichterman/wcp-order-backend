const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var WCategorySchema = new Schema({
  // brief name of the category
  name: { type: String, required: true },

  // longer, optional description of the category, 
  // used instead of the name if present. HTML allowed.
  description: String,

  // parent category ID if any
  parent_id: String,  

  // subheading, optional
  subheading: String
});

module.exports = WCategorySchema;