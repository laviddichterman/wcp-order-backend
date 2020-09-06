const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const ExternalIDsSchema = require("../ExternalIDsSchema");

const WOptionTypeSchema = new Schema({
  // Human readable name
  name: { type: String, required: true },

  // name override for how we display this to a customer
  display_name: String,

  // external ids
  externalIDs: ExternalIDsSchema,

  // ordinal
  ordinal: { type: Number, required: true },

  min_selected: { type: Number, required: true },

  max_selected: { type: Number, required: false },

  display_flags: {
    // if no options can be selected, don't display this modifier section at all
    omit_section_if_no_available_options: Boolean,
    // if any option of this modifier isn't selectable, don't show it grayed out
    omit_options_if_not_available: Boolean,
    // if there's only two modes for an option, show it as a single select
    // requires min_selected === 1 && max_selected === 1
    use_toggle_if_only_two_options: Boolean,
    // if true, this modifier type will not be shown to the end user when 
    // customizing the associated product
    hidden: Boolean,
    // if this modifier has no selected options, the name string can include reference
    // to this modifier type by saying nothing, your choice of {display_name}, or if max_selected===1 listing the choices
    empty_display_as: {
      type: String,
      enum: ['OMIT', 'YOUR_CHOICE_OF', 'LIST_CHOICES'],
      required: true
    },
    modifier_class: {
      type: String,
      enum: ['SIZE', 'ADD', 'SUB', 'REMOVAL', 'NOTE', 'PROMPT'],
      required: true
    }
  },

});

module.exports = WOptionTypeSchema;
