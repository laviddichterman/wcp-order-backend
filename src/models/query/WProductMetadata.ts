import { ProductMetadataExpression, MetadataField, PRODUCT_LOCATION } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WProductMetadataExpression = new Schema<ProductMetadataExpression>({
  field: MetadataField,
  location: PRODUCT_LOCATION
});

export default mongoose.model<ProductMetadataExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WProductMetadataExpression);

