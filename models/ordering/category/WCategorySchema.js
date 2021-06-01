const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var WCategorySchema = new Schema({
  // brief name of the category
  name: { type: String, required: true },

  // longer, optional description of the category, 
  // used instead of the name if present. HTML allowed.
  description: String,

  // placement index
  ordinal: {
    type: Number,
    required: true
  },
    
  // parent category ID if any
  parent_id: String,  

  // subheading, optional, HTML allowed
  subheading: String,

  // footnotes (like for health dept warnings), optional, HTML allowed
  footnotes: String,

  display_flags: {
    call_line_name: String,
    call_line_display: {
      type: String,
      enum: ['SHORTCODE', 'SHORTNAME'],
      required: true
    }
  }


});

module.exports = WCategorySchema;