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
  time_step: [{
    type: Number,
    default: 15
  }],
  config: {
    SQUARE_LOCATION: String,
    MENU_CATID: String,
    MAIN_CATID: String,
    SUPP_CATID: String,
    TAX_RATE: Number,
    SQUARE_APPLICATION_ID: String,
    ALLOW_ADVANCED: Boolean,
    ALLOW_SLICING: Boolean,
    MAX_PARTY_SIZE: Number,
    DELIVERY_LINK: String,
    DELIVERY_FEE: Number,
    AUTOGRAT_THRESHOLD: Number
  },
  pipeline_info: PipelineSchema,
  operating_hours: [[[[Number]]]]
});

export default mongoose.model<IWSettings>(path.basename(__filename).replace(path.extname(__filename), ''), SettingsSchema);
