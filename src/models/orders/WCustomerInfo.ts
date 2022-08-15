import {Schema} from "mongoose";
import { CustomerInfoDto } from "@wcp/wcpshared";

export const CustomerInfoSchema = new Schema<CustomerInfoDto>({
  givenName: { 
    type: String,
    required: true
  },
  familyName: { 
    type: String,
    required: true
  },
  mobileNum: { 
    type: String,
    required: true
  },
  email: { 
    type: String,
    required: true
  },
  referral: String,
}, { _id: false });
