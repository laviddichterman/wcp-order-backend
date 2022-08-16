import { Schema } from "mongoose";
import { CoreCartEntry, WCPProductV2Dto } from "@wcp/wcpshared";
import { WOptionInstanceSchema } from "../catalog/options/WOptionInstanceSchema";

export const WOrderProductInstanceSchema = new Schema<WCPProductV2Dto>({
  pid: { 
    type: String,
    required: true,
    ref: "WProductModel"
  },
  modifiers: {
    type: Schema.Types.Map,
    of: [WOptionInstanceSchema],
    required: true
  }
}, { _id: false });

export const OrderCartEntrySchema = new Schema<CoreCartEntry<WCPProductV2Dto>>({
  categoryId: { 
    type: String,
    required: true,
    ref: 'WCategoryModel'
  },
  product: { 
    type: WOrderProductInstanceSchema,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  }
}, { _id: false });