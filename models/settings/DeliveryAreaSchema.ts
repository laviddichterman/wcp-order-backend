import mongoose, {Schema} from "mongoose";
import path from 'path';

export const DeliveryAreaSchema = new Schema<GeoJSON.Polygon>({
  type: {
    type: String,
    enum: ['Polygon'],
  },
  coordinates: {
    type: [[[Number]]], // Array of arrays of arrays of numbers
  }
});

export default mongoose.model<GeoJSON.Polygon>(path.basename(__filename).replace(path.extname(__filename), ''), DeliveryAreaSchema);
