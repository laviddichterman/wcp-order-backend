import mongoose, {Schema} from "mongoose";
import path from "path";
import { IOption } from "@wcp/wcpshared";
import { WMoney } from "../../WMoney";
import { IntervalSchema } from "../../IntervalSchema";

type MT = Omit<IOption, "id">;

export const WOptionSchema = new Schema<MT>({
    // Nice name of the modifier, required
  display_name: { 
    type: String,
    required: true 
  },
  // detailed name of the modifier, optional
  description: String,

  // short, or kitchen name, required
  shortcode: {
    type: String,
    required: true
  },
  
  // Moneys in base currency unit (300 is $3)
  price: WMoney,

  externalIDs: {
    type: Map,
    of: String,
    required: true
  },

  // flag to temporarily turn off this product and any products that contain this
  // start and end are epoch times in the local timezone
  // special values: 
  //   start > end means generally disabled
  //   disabled not defined: means enabled
  disabled: IntervalSchema,

  // placement index
  ordinal: {
    type: Number,
    required: true
  },

  // option type enumeration
  option_type_id: { 
    type: String, 
    ref: 'WOptionTypeSchema', 
    required: true 
  }, 

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
  enable_function: { type: String, ref: 'WProductInstanceFunction' },

  display_flags: {
    // supresses listing on the shortname of the end product
    // if not the pre-populated value for the matching product instance
    omit_from_shortname: Boolean,

    // supresses listing on the name of the end product
    // if not the pre-populated value for the matching product instance
    omit_from_name: Boolean
  },
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const WOptionModel = mongoose.model<IOption>(path.basename(__filename).replace(path.extname(__filename), ''), WOptionSchema);
