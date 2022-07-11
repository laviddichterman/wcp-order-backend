import mongoose, { Schema } from 'mongoose';
import { ICategory, CALL_LINE_DISPLAY } from '@wcp/wcpshared';
import path from 'path';

export const WCategorySchema = new Schema<ICategory>({
  _id: { type: String, required: true },

  // brief name of the category
  name: { type: String, required: true },

  // longer, optional description of the category, 
  // used instead of the name if present. HTML allowed.
  description: String,

  // placement index
  ordinal: {
    type: Number,
    required: true
  },
    
  // parent category ID if any
  parent_id: { type: String, ref: 'WCategorySchema'},  

  // subheading, optional, HTML allowed
  subheading: String,

  // footnotes (like for health dept warnings), optional, HTML allowed
  footnotes: String,

  display_flags: {
    call_line_name: String,
    call_line_display: {
      type: String,
      enum: CALL_LINE_DISPLAY,
      required: true
    }
  }
});

export default mongoose.model<ICategory>(path.basename(__filename).replace(path.extname(__filename), ''), WCategorySchema);
