const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// represents a class of products that can be made and inserted into the catalog
var WProductSchema = new Schema({

  name: { type: String,
    required: true
  },

  // ordinal
  ordinal: Number, 

  modifiers: [String], // list of option_type_ids

  // Corresponding to a WCategorySchema
  category_ids: [String],
});


module.exports = WProductSchema;
