import { IProduct } from "@wcp/wcpshared";
import mongoose, {Schema} from "mongoose";
import { WCatalogItemSchema } from "../WCatalogItemSchema";
import { WMoney } from "../WMoney";
import path from 'path';

type MT = Omit<IProduct, "id">;
export const ProductModifierSchema = new Schema({ 
  mtid: { type: Schema.Types.String, ref: 'WOptionTypeSchema', required: true }, 
  // optional function object that operates on a product instance
  // and returns true if the option type should be enabled.
  enable: { type: Schema.Types.String, ref: 'WProductInstanceFunction' } 
}, { _id: false });


// represents a class of products that can be made and inserted into the catalog
const WProductSchema = new Schema<MT>({  
  // in process of deprecation
  item: WCatalogItemSchema,

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

  // list of service numbers (0, 1, 2...) for which this product should be disabled.
  // The numbers here should match up with service types enumeration.
  // [2, 1] would mean that this product and all instances should be considered disabled
  // for orders with service types of 1 or 2.
  service_disable: [Number],
  
  display_flags: {
    flavor_max: Number,
    bake_max: Number,
    bake_differential: Number,
    show_name_of_base_product: Boolean,
    singular_noun: String
  },

  // TODO: implement timing information across products and modifier options that
  // informs the prep time for the product and for any additional items
  timing: {
    min_prep_time: Number,
    additional_unit_prep_time: Number
  },

  // list of option type IDs and nullable product instance function IDs
  modifiers: [ProductModifierSchema],
  
  // Corresponding to a WCategorySchema
  category_ids: [{ type: String, ref: 'WCategorySchema', _id: false }],
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export default mongoose.model<IProduct>(path.basename(__filename).replace(path.extname(__filename), ''), WProductSchema);