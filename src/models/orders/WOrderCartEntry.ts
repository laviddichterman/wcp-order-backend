import mongoose, {Schema} from "mongoose";
import path from "path";
import { CoreCartEntry, WCPProductV2Dto, WOrderInstance, WOrderInstanceNoId } from "@wcp/wcpshared";

export const WProductDtoSchema = new Schema<WCPProductV2Dto>({

}, { _id: false });

export const OrderCartEntry = new Schema<CoreCartEntry<WCPProductV2Dto>>({
  categoryId: { 
    type: String,
    required: true,
    ref: 'WCategoryModel'
  },
  product: { 
    type: WProductDtoSchema,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  }
}, { _id: false });