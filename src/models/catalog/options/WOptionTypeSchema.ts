import mongoose, { Schema } from "mongoose";
import path from "path";
import { IOptionType, DISPLAY_AS, MODIFIER_CLASS } from "@wcp/wcpshared";
import { KeyValueEntrySchema } from "../../settings/KeyValueSchema";

type MT = Omit<IOptionType, "id">;

export const WOptionTypeSchema = new Schema<MT>({
  // Human readable name
  name: { type: String, required: true },

  // name override for how we display this to a customer
  displayName: String,

  externalIDs: {
    type: [KeyValueEntrySchema],
    required: true
  },

  // ordinal
  ordinal: { type: Number, required: true },

  // if the option type should NOT be enabled, then the min requirements need not be met for
  // a complete product.
  min_selected: { type: Number, required: true },

  // if the option type should NOT be enabled, then the max requirements need not be met for
  // a complete product.
  max_selected: { type: Number, required: false },

  displayFlags: {
    is3p: {
      type: Boolean,
      required: true
    },
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
    // if the enable_function returns false, then no text is displayed
    empty_display_as: {
      type: String,
      enum: DISPLAY_AS,
      required: true
    },
    modifier_class: {
      type: String,
      enum: MODIFIER_CLASS,
      required: true
    },
    // string to match in the product description template, not including the brackets
    // limited to alphanumeric characters
    template_string: String,

    // separator to be used in joining the individual options together for display
    multiple_item_separator: String,

    // when the section is not empty, string to PREpend to the whole modifier type section when used in description/title, etc
    non_empty_group_prefix: String,

    // when the section is not empty, string to append to the whole modifier type section when used in description/title, etc
    non_empty_group_suffix: String,
  },

}, { id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const WOptionTypeModel = mongoose.model<IOptionType>(path.basename(__filename).replace(path.extname(__filename), ''), WOptionTypeSchema);