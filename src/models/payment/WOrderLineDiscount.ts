import { DiscountMethod, OrderLineDiscount, OrderLineDiscountCodeAmount, TenderBaseStatus } from "@wcp/wcpshared";
import { WMoney } from "../WMoney";
import { Schema } from "mongoose";
import { WEncryptStringLockSchema } from "./WEncryptStringLock";

export const WOrderLineDiscountSchema = new Schema<OrderLineDiscount>({
  t: {
    type: String,
    enum: DiscountMethod,
    required: true
  },
  createdAt: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: TenderBaseStatus,
    requred: true
  },
  discount: {
    type: Schema.Types.Mixed,
    required: true
  }
}, { _id: false, discriminatorKey: 't', toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const WOrderLineDiscountCodeAmountSchema = WOrderLineDiscountSchema.discriminator(DiscountMethod.CreditCodeAmount,
  new Schema<OrderLineDiscountCodeAmount>({
    discount: {
      type: {
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
      },
      _id: false,
      required: true
    }
  }, { _id: false, discriminatorKey: 't', toJSON: { virtuals: true }, toObject: { virtuals: true } }));
