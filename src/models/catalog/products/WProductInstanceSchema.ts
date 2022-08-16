import { IProductInstance, ModifiersMap, PriceDisplay } from "@wcp/wcpshared";
import mongoose, {Schema} from "mongoose";
import path from "path";
import { WOptionInstanceSchema } from "../options/WOptionInstanceSchema";

type MT = Omit<IProductInstance, "id">;
export const WProductInstanceSchema = new Schema<MT>({
  // reference to the WProductSchema ID for this class of item
  productId: { type: String, ref: 'WProductSchema', required: true },

  // ordinal for product matching
  ordinal: Number,

  // applied modifiers for this instance of the product
  modifiers: {
    type: Schema.Types.Map,
    of: [WOptionInstanceSchema],
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

  // external ids
  externalIDs: {
    type: Map,
    of: String,
    required: true
  },
  
  // flag to note that this product instance is the "default" form of the product to which all others should be compared
  isBase: { 
    type: Boolean,
    required: true
  },

  displayFlags: {
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
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const WProductInstanceModel = mongoose.model<IProductInstance>(path.basename(__filename).replace(path.extname(__filename), ''), WProductInstanceSchema);
