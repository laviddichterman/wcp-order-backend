import { IProductInstance, PriceDisplay } from "@wcp/wcpshared";
import { KeyValueEntrySchema } from "../../settings/KeyValueSchema";
import mongoose, { Schema } from "mongoose";
import path from "path";
import { ProductModifierSchema } from "../options/WOptionInstanceSchema";

type MT = Omit<IProductInstance, "id">;
export const WProductInstanceSchema = new Schema<MT>({
  // reference to the WProductSchema ID for this class of item
  productId: { type: String, ref: 'WProductSchema', required: true },

  // ordinal for product matching
  ordinal: Number,

  // applied modifiers for this instance of the product
  modifiers: {
    type: [ProductModifierSchema],
    required: true
  },

  // Nice name of the product
  // eg: House Sausage
  displayName: {
    type: String,
    required: true
  },

  // Nice, long description of the product
  // eg: House-ground spicy pork sausage
  // This is displayed alongside any modifiers for the product
  // HTML allowed
  description: String,

  // abbreviation used in store
  shortcode: {
    type: String,
    required: true
  },

  externalIDs: {
    type: [KeyValueEntrySchema],
    required: true
  },

  displayFlags: {
    pos: {
      // name used internally in the POS, so things like BEERNAME pint and BEERNAME growler fill can exist without muddying up the menu names
      // eg: ABT 12 growler fill
      name: String,
      hide: Boolean,
      skip_customization: Boolean
    },
    menu: {
      // ordering within this product instance's category in menu page
      ordinal: Number,
      // flag to hide this from the menu
      hide: Boolean,
      // governs how prices get displayed in the menu page according to the enum      
      price_display: {
        type: String,
        enum: PriceDisplay
      },
      // HTML-friendly message wrapping the display of this PI in the menu page
      adornment: String,
      // suppress the default pizza functionality where the full modifier list is surfaced on the product display
      // and instead use the templating strings to determine what is/isn't displayed
      suppress_exhaustive_modifier_list: Boolean,
      // show the modifier option list as part of the menu display for this product instance
      show_modifier_options: Boolean
    },
    order: {
      // ordering within this product instance's category in order page
      ordinal: Number,
      // flag to hide this from the ordering page
      hide: Boolean,
      // flag to skip going right to customization when the user adds this to their order
      skip_customization: Boolean,
      // governs how prices get displayed in the order page according to the enum
      price_display: {
        type: String,
        enum: PriceDisplay
      },
      // HTML-friendly message wrapping the display of this PI in the order page
      adornment: String,
      // suppress the default pizza functionality where the full modifier list is surfaced on the product display
      // and instead use the templating strings to determine what is/isn't displayed
      suppress_exhaustive_modifier_list: Boolean
    },
  }
}, { id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const WProductInstanceModel = mongoose.model<IProductInstance>(path.basename(__filename).replace(path.extname(__filename), ''), WProductInstanceSchema);
