import { Schema } from "mongoose";
import { Metrics } from "@wcp/wario-shared";

export const WMetricsSchema = new Schema<Metrics>({
    pageLoadTime: Number,
    numTimeBumps: Number,
    numTipAdjusts: Number,
    numTipFixed: Number,
    timeToFirstProduct: Number,
    timeToServiceDate: Number,
    timeToServiceTime: Number,
    timeToStage: [Number],
    submitTime: Number,
    useragent: String,
    ipAddress: String
}, { _id: false });
