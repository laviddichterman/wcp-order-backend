import { Schema } from "mongoose";
import { IOptionInstance, OptionPlacement, OptionQualifier, ProductModifierEntry } from "@wcp/wcpshared";

export const WOptionInstanceSchema = new Schema<IOptionInstance>({
  optionId: {
    type: String,
    required: true
  },

  placement: {
    type: Number,
    enum: OptionPlacement,
    required: true
  },

  qualifier: {
    type: Number,
    enum: OptionQualifier,
    required: true
  }
}, { _id: false});

export const ProductModifierSchema = new Schema<ProductModifierEntry>({
  modifierTypeId: {
    type: String,
    ref: 'WOptionTypeSchema',
    required: true
  },
  options: {
    type: [WOptionInstanceSchema],
    required: true
  }
}, { _id: false});