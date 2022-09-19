import mongoose, { Schema } from "mongoose";
import path from "path";
import { WOrderInstance, WOrderStatus } from "@wcp/wcpshared";
import { CustomerInfoSchema } from "./WCustomerInfo";
import { OrderCartEntrySchema } from "./WOrderCartEntry";
import { FulfillmentInfo } from "./WFulfillmentInfo";
import { WMetricsSchema } from "./WMetrics";
import { WOrderLineDiscountSchema } from "../payment/WOrderLineDiscount";
import { WOrderPaymentSchema } from "../payment/WOrderPayment";
import { KeyValueEntrySchema } from "../settings/KeyValueSchema";

export const WOrderInstanceSchema = new Schema<Omit<WOrderInstance, 'id'>>({
  status: {
    type: String,
    enum: WOrderStatus,
    required: true
  },
  customerInfo: {
    type: CustomerInfoSchema,
    required: true
  },
  fulfillment: {
    type: FulfillmentInfo,
    required: true
  },
  cart: {
    type: [OrderCartEntrySchema],
    required: true
  },
  discounts: {
    type: [WOrderLineDiscountSchema],
    required: true
  },
  payments: {
    type: [WOrderPaymentSchema],
    required: true
  },
  refunds: {
    type: [WOrderPaymentSchema],
    required: true
  },
  metrics: {
    type: WMetricsSchema,
    required: true
  },
  metadata: {
    type: [KeyValueEntrySchema],
    required: true
  },
  specialInstructions: String,
  locked: String
}, { id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const WOrderInstanceModel = mongoose.model<WOrderInstance>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderInstanceSchema);
//WOrderInstanceSchema.path('payments').discriminator(PaymentMethod.StoreCredit, WStoreCreditPaymentSchema);