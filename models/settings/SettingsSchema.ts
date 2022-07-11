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
  pipeline_info: PipelineSchema,
  operating_hours: [[[[Number]]]]
});

export default mongoose.model<IWSettings>(path.basename(__filename).replace(path.extname(__filename), ''), SettingsSchema);
