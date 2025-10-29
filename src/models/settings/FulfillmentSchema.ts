import { FulfillmentType, FulfillmentConfig, DayOfTheWeek, DateIntervalEntry } from "@wcp/wario-shared";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { IntervalSchema } from "../IntervalSchema";
import { DeliveryAreaSchema } from "./DeliveryAreaSchema";

type MT = Omit<FulfillmentConfig, "id">;

const IntervalEntrySchema = new Schema<DateIntervalEntry>({
  key: { 
    type: String,
    requred: true
  },
  value: {
    type: [IntervalSchema],
    required: true
  }
}, { _id: false });

export const FulfillmentSchema = new Schema<MT>({
  displayName: {
    type: String,
    required: true
  },
  shortcode: {
    type: String,
    required: true
  },
  exposeFulfillment: {
    type: Boolean,
    required: true
  },
  ordinal: {
    type: Number,
    min: 0,
    required: true
  },
  service: {
    type: String,
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
  allowTipping: {
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
  orderSupplementaryCategoryId: {
    type: String,
    required: false,
    ref: 'WCategorySchema'
  },
  messages: {
    type: {
      DESCRIPTION: String,
      CONFIRMATION: String,
      INSTRUCTIONS: String
    },
    required: true,
    _id: false
  },
  terms: { type: [String], required: true },
  autograt: Schema.Types.Mixed,
  serviceCharge: Schema.Types.Mixed,
  leadTime: { type: Number, required: true },
  operatingHours: {
    type: {
      [DayOfTheWeek.SUNDAY]: {
        type: [IntervalSchema],
        required: true
      },
      [DayOfTheWeek.MONDAY]: {
        type: [IntervalSchema],
        required: true
      },
      [DayOfTheWeek.TUESDAY]: {
        type: [IntervalSchema],
        required: true
      },
      [DayOfTheWeek.WEDNESDAY]: {
        type: [IntervalSchema],
        required: true
      },
      [DayOfTheWeek.THURSDAY]: {
        type: [IntervalSchema],
        required: true
      },
      [DayOfTheWeek.FRIDAY]: {
        type: [IntervalSchema],
        required: true
      },
      [DayOfTheWeek.SATURDAY]: {
        type: [IntervalSchema],
        required: true
      },
    },
    required: true,
    _id: false
  },
  specialHours: {
    type: [IntervalEntrySchema],
    default: [],
    required: true,
    _id: false
  },
  blockedOff: {
    type: [IntervalEntrySchema],
    default: [],
    required: true,
    _id: false
  },
  minDuration: { type: Number, required: true },
  maxDuration: { type: Number, required: true },
  timeStep: { type: Number, required: true },
  maxGuests: Number,
  serviceArea: DeliveryAreaSchema
}, { id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const FulfillmentModel = mongoose.model<FulfillmentConfig>(path.basename(__filename).replace(path.extname(__filename), ''), FulfillmentSchema);
