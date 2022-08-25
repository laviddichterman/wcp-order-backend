import { Schema } from "mongoose";
import { OrderPayment, PaymentMethod, TenderBaseStatus, StoreCreditPayment, CreditPayment, CashPayment } from "@wcp/wcpshared";
import { WMoney } from "../WMoney";
import { WEncryptStringLockSchema } from "./WEncryptStringLock";

export const WOrderPaymentSchema = new Schema({
  t: {
    type: String,
    enum: PaymentMethod,
    required: true
  },
  createdAt: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: TenderBaseStatus,
    requred: true
  },
  amount: {
    type: WMoney,
    required: true
  },
  payment: {
    type: Schema.Types.Mixed,
    required: true
  }
}, { _id: false, discriminatorKey: 't', toJSON: { virtuals: true }, toObject: { virtuals: true } });


//export const WOrderPaymentModel = mongoose.model<OrderPayment>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderPaymentSchema);
export const WCashPaymentSchema = WOrderPaymentSchema.discriminator(PaymentMethod.Cash,
  new Schema<CashPayment>({
    payment: {
      type: {
        amountTendered: {
          type: WMoney,
          required: true
        },
        change: {
          type: WMoney,
          required: true
        }
      },
      _id: false,
      required: true
    }
  }, { _id: false, discriminatorKey: 't', toJSON: { virtuals: true }, toObject: { virtuals: true } }));

export const WStoreCreditPaymentSchema = WOrderPaymentSchema.discriminator(PaymentMethod.StoreCredit,
  new Schema<StoreCreditPayment>({
    payment: {
      type: {
        code: {
          type: String,
          required: true
        },
        lock: {
          type: WEncryptStringLockSchema,
          required: true
        },
      },
      _id: false,
      required: true
    }
  }, { _id: false, discriminatorKey: 't', toJSON: { virtuals: true }, toObject: { virtuals: true } }));

export const WCreditPaymentSchema = WOrderPaymentSchema.discriminator(PaymentMethod.CreditCard,
  new Schema<CreditPayment>({
    payment: {
      type: {
        processor: {
          type: String,
          enum: ["SQUARE"],
          required: true
        },
        processorId: {
          type: String,
          required: true
        },
        receiptUrl: {
          type: String,
          required: true
        },
        last4: {
          type: String,
          required: true
        },
        expYear: {
          type: String,
          required: true
        },
        cardholderName: String,
        billingZip: String,
      },
      _id: false,
      required: true
    }
  }, { _id: false, discriminatorKey: 't', toJSON: { virtuals: true }, toObject: { virtuals: true } }));
