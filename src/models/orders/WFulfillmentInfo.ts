import { Schema } from "mongoose";
import { AddressComponent, DeliveryAddressValidateResponse, DeliveryInfoDto, DineInInfoDto, FulfillmentDto, WFulfillmentStatus } from "@wcp/wcpshared";

export const DineInInfoSchema = new Schema<DineInInfoDto>({
  partySize: {
    type: Number,
    required: true
  }
}, { _id: false });

export const AddressComponentSchema = new Schema<AddressComponent>({
  types: [String],
  long_name: String,
  short_name: String
}, { _id: false });

export const DeliveryAddressValidateResponseSchema = new Schema<DeliveryAddressValidateResponse>({
  validated_address: { 
    type: String,
    required: true
  },
  in_area: {
    type: Boolean,
    required: true
  },
  found: {
    type: Boolean,
    required: true
  },
  address_components: [AddressComponentSchema]
}, { _id: false });

export const DeliveryInfoSchema = new Schema<DeliveryInfoDto>({
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
  validation: DeliveryAddressValidateResponseSchema
}, { _id: false });

export const FulfillmentInfo = new Schema<FulfillmentDto>({
  status: {
    type: String,
    enum: WFulfillmentStatus,
    required: true
  },
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