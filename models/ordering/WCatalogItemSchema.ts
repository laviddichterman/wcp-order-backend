import { ICatalogItem } from "@wcp/wcpshared";
import mongoose, {Schema} from "mongoose";
import path from 'path';
import { ExternalIDsSchema } from"./ExternalIDsSchema";
import { WMoney } from "./WMoney";

// NOTE: this is a mix-in and probably won't be instantiated directly
export const WCatalogItemSchema = new Schema<ICatalogItem>({
  // Nice name of the product
  // eg: House Sausage
  display_name: String,

  // Nice, long description of the product
  // eg: House-ground spicy pork sausage
  // This is displayed alongside any modifiers for the product
  // HTML allowed
  description: String,

  // abbreviation used in store
  shortcode: String,

  // Moneys in base currency unit (300 is $3)
  price: WMoney,

  // external ids
  externalIDs: ExternalIDsSchema,

  // flag to temporarily turn off this product and any products that contain this
  // start and end are epoch times in the local timezone
  // special values: 
  //   start > end means generally disabled
  //   disabled not defined: means enabled
  disabled: {
    start: Number,
    end: Number
  },

  // flag to PERMANENTLY turn off this product, roughly equivalent to a deletion,
  // but not because we want to be able to be able to reference the product later on
  permanent_disable: Boolean
}, { _id: false});

export default mongoose.model<ICatalogItem>(path.basename(__filename).replace(path.extname(__filename), ''), WCatalogItemSchema);
