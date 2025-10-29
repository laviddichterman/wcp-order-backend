import { PrepTiming } from "@wcp/wario-shared";
import { Schema } from "mongoose";

export const PrepTimingSchema = new Schema<PrepTiming>({
  additionalUnitPrepTime: {
    type: Number,
    required: true,
    min: 0
  },
  prepStationId: {
    type: Number,
    required: true
  },
  prepTime: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });