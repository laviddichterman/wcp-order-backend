import mongoose from "mongoose";
import { WCatalogItemSchema } from "../WCatalogItemSchema";
const Schema = mongoose.Schema;

export const WOptionSchema = new Schema({
  // inheritance by composition
  // the base catalog item
  item: { 
    type: WCatalogItemSchema, 
    required: true 
  },

  // placement index
  ordinal: {
    type: Number,
    required: true
  },

  // option type enumeration
  option_type_id: { type: Schema.Types.ObjectId, ref: 'WOptionTypeSchema', required: true }, 

  metadata: {
    // how much this contributes to the flavor
    flavor_factor: Number,

    // how much weight/moisture this contributes
    bake_factor: Number,

    // boolean flag representing if the option can be split left/right
    can_split: Boolean,
  },

  // optional function object that operates on a product instance
  // and returns true if the option should be enabled.
  enable_function: { type: Schema.Types.ObjectId, ref: 'WProductInstanceFunction' },

  display_flags: {
    // supresses listing on the shortname of the end product
    // if not the pre-populated value for the matching product instance
    omit_from_shortname: Boolean,

    // supresses listing on the name of the end product
    // if not the pre-populated value for the matching product instance
    omit_from_name: Boolean
  },
});

module.exports = WOptionSchema;