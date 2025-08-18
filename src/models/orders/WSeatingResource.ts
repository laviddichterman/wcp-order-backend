import path from 'path';
import mongoose, { Schema } from 'mongoose';
import { SeatingResource } from '@wcp/wcpshared';

type MT = Omit<SeatingResource, "id">;
export const SeatingResourceSchema = new Schema<MT>({
  name: { type: String, required: true },
  capacity: { 
    type: Number,
    required: true
  },
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const SeatingResourceModel = mongoose.model<SeatingResource>(path.basename(__filename).replace(path.extname(__filename), ''), SeatingResourceSchema);
