import { FulfillmentType, FulfillmentConfig } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { IntervalSchema } from "../IntervalSchema";
import { DeliveryAreaSchema } from "./DeliveryAreaSchema";

type MT = Omit<FulfillmentConfig, "id">;

export const FulfillmentSchema = new Schema<MT>({
  displayName: {
    type: String,
    required: true
  },
  shortcode: {
    type: String,
    required: true
  },
  ordinal: {
    type: Number,
    min: 0,
    required: true
  },
  service: { 
    type: Number,
    enum: FulfillmentType,
    required: true
  },
  allowPrepayment: {
    type: Boolean,
    required: true
  },
  requirePrepayment: {
    type: Boolean,
    required: true
  },
  menuBaseCategoryId: {
    type: String,
    required: true,
    ref: 'WCategorySchema'
  },
  orderBaseCategoryId: {
    type: String,
    required: true,
    ref: 'WCategorySchema'
  },

  messages: {
    CONFIRMATION: String
  },
  terms: { type: [String], required: true },
  autograt: Schema.Types.Mixed,
  serviceCharge: Schema.Types.Mixed,
  leadTime: { type: Number, required: true },
  operatingHours: {
    type: Map,
    of: [IntervalSchema],
    required: true
  },
  specialHours: { 
    type: Schema.Types.Map, 
    of: [IntervalSchema],
    required: true
  },
  blockedOff: { 
    type: Schema.Types.Map, 
    of: [IntervalSchema],
    required: true
  },
  minDuration: { type: Number, required: true },
  maxDuration: { type: Number, required: true },
  timeStep: { type: Number, required: true },
  maxGuests: Number,
  serviceArea: DeliveryAreaSchema
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const FulfillmentModel = mongoose.model<FulfillmentConfig>(path.basename(__filename).replace(path.extname(__filename), ''), FulfillmentSchema);
