import { Schema } from "mongoose";
import { DeliveryInfoDto, DineInInfoDto, FulfillmentDto } from "@wcp/wcpshared";

export const DineInInfoSchema = new Schema<DineInInfoDto>({
  partySize: {
    type: Number,
    required: true
  }
}, { _id: false });


export const DeliveryInfoSchema = new Schema<Omit<DeliveryInfoDto, 'validation'>>({
  address: { 
    type: String,
    required: true
  },
  address2: String,
  zipcode: { 
    type: String,
    required: true
  },
  deliveryInstructions: String,
}, { _id: false });

export const FulfillmentInfo = new Schema<FulfillmentDto>({
  selectedService: { 
    type: String,
    required: true,
    ref: 'FulfillmentModel'
  },
  // as formatISODate
  selectedDate: { 
    type: String,
    required: true
  },
  selectedTime: { 
    type: Number,
    required: true
  },
  dineInInfo: DineInInfoSchema,
  deliveryInfo: DeliveryInfoSchema
}, { _id: false });