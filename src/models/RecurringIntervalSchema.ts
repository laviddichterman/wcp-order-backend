import { IRecurringInterval } from "@wcp/wcpshared";
import {Schema} from "mongoose";
import { IntervalSchema } from "./IntervalSchema";

export const RecurringIntervalSchema = new Schema<IRecurringInterval>({
  interval: IntervalSchema,
  rrule: String
}, { _id: false });