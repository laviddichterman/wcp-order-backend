import path from 'path';
import mongoose, { Schema } from 'mongoose';
import { SeatingResource, SeatingShape } from '@wcp/wcpshared';

type MT = Omit<SeatingResource, "id">;
export const SeatingResourceSchema = new Schema<MT>({
  name: { type: String, required: true },
  capacity: { 
    type: Number,
    required: true
  },
  shape: { type: String, enum: SeatingShape, required: true },
  sectionId: { type: String, required: true },
  center: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  shapeDims: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  rotation: { type: Number, required: true },
  disabled: { type: Boolean, default: false }
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const SeatingResourceModel = mongoose.model<SeatingResource>(path.basename(__filename).replace(path.extname(__filename), ''), SeatingResourceSchema);
