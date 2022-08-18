import { IWSettings } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

const PipelineStageSchema = new Schema({ slots: Number, time: Number }, {_id: false});
const PipelineSchema = new Schema({
  baking_pipeline: [PipelineStageSchema],
  transfer_padding: Number
}, {_id: false});

export const SettingsSchema = new Schema<IWSettings>({
  additional_pizza_lead_time: {
    type: Number,
    default: 5
  },
  config: {
    LOCATION_NAME: String,
    SQUARE_LOCATION: String,
    SQUARE_APPLICATION_ID: String,
    MENU_CATID: String,
    MAIN_CATID: String,
    SUPP_CATID: String,
    TAX_RATE: Number,
    ALLOW_ADVANCED: Boolean,
    MAX_PARTY_SIZE: Number,
    DELIVERY_LINK: String,
    DELIVERY_FEE: Number,
    AUTOGRAT_THRESHOLD: Number,
    MESSAGE_REQUEST_VEGAN: String,
    MESSAGE_REQUEST_HALF: String,
    MESSAGE_REQUEST_WELLDONE: String,
    MESSAGE_REQUEST_SLICING: String
  },
  pipeline_info: PipelineSchema,
});

export default mongoose.model<IWSettings>(path.basename(__filename).replace(path.extname(__filename), ''), SettingsSchema);
