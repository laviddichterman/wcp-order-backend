import { FulfillmentType, FulfillmentConfig } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { IntervalSchema } from "./BlockedOffSchema";
import DeliveryAreaSchema from "./DeliveryAreaSchema";

type MT = Omit<FulfillmentConfig, "id">;

export const FulfillmentSchema = new Schema<MT>({
  service: { 
    type: Number,
    enum: FulfillmentType,
    required: true
  },
  terms: { type: [String], required: true },
  autograt: Schema.Types.Mixed,
  serviceCharge: Schema.Types.Mixed,
  leadTime: { type: Number, required: true },
  operatingHours: {
    type: Map,
    of: [IntervalSchema]
  },
  specialHours: { 
    type: Schema.Types.Map, 
    of: [IntervalSchema]
  },
  blockedOff: { 
    type: [IntervalSchema],
    required: true 
  },
  minDuration: { type: Number, required: true },
  maxDuration: { type: Number, required: true },
  timeStep: { type: Number, required: true },
  maxGuests: Number,
  serviceArea: DeliveryAreaSchema
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const FulfillmentModel = mongoose.model<FulfillmentConfig>(path.basename(__filename).replace(path.extname(__filename), ''), FulfillmentSchema);
