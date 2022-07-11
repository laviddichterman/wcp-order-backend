import mongoose, {Schema} from "mongoose";

export const DeliveryAreaSchema = new Schema<GeoJSON.Polygon>({
  type: {
    type: String,
    enum: ['Polygon'],
  },
  coordinates: {
    type: [[[Number]]], // Array of arrays of arrays of numbers
  }
});

module.exports = DeliveryAreaSchema;
