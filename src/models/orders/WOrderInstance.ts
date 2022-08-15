import mongoose, {Schema} from "mongoose";
import path from "path";
import { CoreCartEntry, WCPProductV2Dto, WOrderInstance, WOrderInstanceNoId } from "@wcp/wcpshared";
import { CustomerInfoSchema } from "./WCustomerInfo";
import { FulfillmentInfo } from "./WFulfillmentInfo";

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
    type: [OrderCartEntry],
    required: true
  },

  // readonly discounts: OrderLineDiscount[];
  // readonly payments: OrderPayment[];
  // readonly refunds: OrderPayment[];
  // readonly metrics: MetricsDto;

}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const WOrderInstanceModel = mongoose.model<WOrderInstance>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderInstanceSchema);
