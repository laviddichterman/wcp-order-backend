import mongoose, {Schema} from "mongoose";
import path from "path";
import { WOrderInstance, WOrderInstanceNoId } from "@wcp/wcpshared";
import { CustomerInfoSchema } from "./WCustomerInfo";
import { OrderCartEntrySchema } from "./WOrderCartEntry";
import { FulfillmentInfo } from "./WFulfillmentInfo";
import { WMetricsSchema } from "./WMetrics";
import { WOrderLineDiscountSchema } from "../payment/WOrderLineDiscount";
import { WOrderPaymentSchema } from "../payment/WOrderPayment";

export const WOrderInstanceSchema = new Schema<WOrderInstanceNoId>({
  status: { 
    type: String,
    enum: ['OPEN', 'COMPLETED', 'CANCELED'],
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
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});


export const WOrderInstanceModel = mongoose.model<WOrderInstance>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderInstanceSchema);
