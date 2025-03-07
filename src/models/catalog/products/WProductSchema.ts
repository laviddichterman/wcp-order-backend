import { IProduct } from "@wcp/wcpshared";
import mongoose, {Schema} from "mongoose";
import { WMoney } from "../../WMoney";
import path from 'path';
import { KeyValueEntrySchema } from "../../settings/KeyValueSchema";
import { PrepTimingSchema } from "../../PrepTimingSchema";
import { RecurringIntervalSchema } from "../../RecurringIntervalSchema";

type MT = Omit<IProduct, "id">;
export const ProductModifierSchema = new Schema({ 
  mtid: { type: Schema.Types.String, ref: 'WOptionTypeSchema', required: true }, 
  // optional function object that operates on a product instance
  // and returns true if the option type should be enabled.
  enable: { type: Schema.Types.String, ref: 'WProductInstanceFunction' },
  // list of fulfillmentIds for which this ModifierType should be disabled.
  serviceDisable: [{ type: String, ref: 'FulfillmentSchema'}],
}, { _id: false });

// represents a class of products that can be made and inserted into the catalog
const WProductSchema = new Schema<MT>({  
  // this should be required but we need to break a cyclic dependency in creation of a new product class
  baseProductId: { type: String, ref: 'WProductInstanceSchema' },

  // Moneys in base currency unit (300 is $3)
  price: { 
    type: WMoney,
    required: true
  },

  // flag to temporarily turn off this product and any products that contain this
  // start and end are epoch times in the local timezone
  // special values: 
  //   start > end means generally disabled
  //   disabled not defined: means enabled
  disabled: {
    start: Number,
    end: Number
  },

  externalIDs: {
    type: [KeyValueEntrySchema],
    required: true
  },

  // list of fulfillmentIds for which this product should be disabled.
  serviceDisable: [{ type: String, ref: 'FulfillmentSchema'}],
  
  displayFlags: {
    is3p: {
      type: Boolean,
      required: true
    },
    flavor_max: Number,
    bake_max: Number,
    bake_differential: Number,
    show_name_of_base_product: Boolean,
    singular_noun: String,
    order_guide: {
      warnings: [String],
      suggestions: [String]
    }
  },

  // preparation timing info, or null if not considered
  timing: PrepTimingSchema,

  availability: {
    type: [RecurringIntervalSchema],
    required: true
  },

  // list of option type IDs and nullable product instance function IDs
  modifiers: [ProductModifierSchema],
  
  // Corresponding to a WCategorySchema
  category_ids: [{ type: String, ref: 'WCategorySchema', _id: false }],

  printerGroup: String
  
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const WProductModel = mongoose.model<IProduct>(path.basename(__filename).replace(path.extname(__filename), ''), WProductSchema);