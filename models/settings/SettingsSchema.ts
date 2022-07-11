import { Schema } from "mongoose";

const PipelineStageSchema = new Schema({ slots: Number, time: Number }, {_id: false});
const PipelineSchema = new Schema({
  baking_pipeline: [PipelineStageSchema],
  transfer_padding: Number
}, {_id: false});

export const SettingsSchema = new Schema({
  additional_pizza_lead_time: {
    type: Number,
    default: 5
  },
  time_step: [{
    type: Number,
    default: 15
  }],
  time_step2: [{
    type: Number,
    default: 15
  }],
  pipeline_info: PipelineSchema,
  operating_hours: [[[[Number]]]]
});
module.exports = SettingsSchema;
