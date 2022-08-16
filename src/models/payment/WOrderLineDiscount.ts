import { DiscountMethod, OrderLineDiscount, OrderLineDiscountCodeAmount, TenderBaseStatus } from "@wcp/wcpshared";
import { WMoney } from "models/catalog/WMoney";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { WEncryptStringLockSchema } from "./WEncryptStringLock";

export const WOrderLineDiscountSchema = new Schema<OrderLineDiscount>({
  createdAt: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: Object.keys(TenderBaseStatus),
    requred: true
  }
}, {_id: false, discriminatorKey: 't'});


//export const WOrderLineDiscountModel = mongoose.model<OrderLineDiscount>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderLineDiscount);
export const WOrderLineDiscountCodeAmountSchema = WOrderLineDiscountSchema.discriminator(DiscountMethod.CreditCodeAmount, 
  new Schema<OrderLineDiscountCodeAmount>({
    amount: { 
      type: WMoney,
      required: true 
    },
    code: {
      type: String,
      required: true
    },
    lock: {
      type: WEncryptStringLockSchema,
      required: true
    }
}, {_id: false, discriminatorKey: 't'}));
