import { Schema } from "mongoose";
import { CoreCartEntry, WCPProductV2Dto } from "@wcp/wario-shared";
import { ProductModifierSchema } from "../catalog/options/WOptionInstanceSchema";

export const WOrderProductInstanceSchema = new Schema<WCPProductV2Dto>({
  pid: { 
    type: String,
    required: true,
    ref: "WProductModel"
  },
  modifiers: {
    type: [ProductModifierSchema],
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