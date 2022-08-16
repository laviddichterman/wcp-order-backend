import { OrderPayment, PaymentMethod, TenderBaseStatus, StoreCreditPayment, CreditPayment, CashPayment } from "@wcp/wcpshared";
import { WMoney } from "models/catalog/WMoney";
import { Schema } from "mongoose";
import { WEncryptStringLockSchema } from "./WEncryptStringLock";

export const WOrderPaymentSchema = new Schema<OrderPayment>({
  createdAt: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: Object.keys(TenderBaseStatus),
    requred: true
  },
  amount: { 
    type: WMoney,
    required: true 
  },
}, {_id: false, discriminatorKey: 't'});


//export const WOrderPaymentModel = mongoose.model<OrderPayment>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderPaymentSchema);
export const WCashPaymentSchema = WOrderPaymentSchema.discriminator(PaymentMethod.Cash, 
  new Schema<CashPayment>({
    amountTendered: { 
      type: WMoney,
      required: true 
    },
    change: { 
      type: WMoney,
      required: true 
    }
}, {_id: false, discriminatorKey: 't'}));

export const WStoreCreditPaymentSchema = WOrderPaymentSchema.discriminator(PaymentMethod.StoreCredit, 
  new Schema<StoreCreditPayment>({
    code: {
      type: String,
      required: true
    },
    lock: {
      type: WEncryptStringLockSchema,
      required: true
    }
}, {_id: false, discriminatorKey: 't'}));

export const WCreditPaymentSchema = WOrderPaymentSchema.discriminator(PaymentMethod.CreditCard, 
  new Schema<CreditPayment>({
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
}, {_id: false, discriminatorKey: 't'}));
