import { Error as SquareError, Client, CreateOrderRequest, CreateOrderResponse, CreatePaymentRequest, Environment, UpdateOrderRequest, OrderLineItem, Money } from 'square';
import { WProvider } from '../types/WProvider';
import crypto from 'crypto';
import logger from'../logging';
import DataProviderInstance from './dataprovider';
import { BigIntStringify } from '../utils';
import { CategorizedRebuiltCart, CreditPayment, CURRENCY, CustomerInfoDto, FulfillmentDto, IMoney, JSFECreditV2, PaymentMethod, TenderBaseStatus } from '@wcp/wcpshared';
import { RecomputeTotalsResult } from './order_manager';
import { formatRFC3339, parseISO } from 'date-fns';

const SQUARE_TAX_RATE_CATALOG_ID = "TMG7E3E5E45OXHJTBOHG2PMS";
const VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID = "DNP5YT6QDIWTB53H46F3ECIN";

export const BigIntMoneyToIntMoney = (bigIntMoney: Money) : IMoney => ({ amount: Number(bigIntMoney.amount!), currency: bigIntMoney.currency! });

export class SquareProvider implements WProvider {
  #client : Client;
  constructor() {
  }

  Bootstrap = () => {
    logger.info(`Starting Bootstrap of SquareProvider`);
    if (DataProviderInstance.KeyValueConfig.SQUARE_TOKEN) {
      this.#client = new Client({
        environment: Environment.Production, // `Environment.Sandbox` to access sandbox resources // TODO: configure this
        accessToken: DataProviderInstance.KeyValueConfig.SQUARE_TOKEN,
      });
    }
    else {
      logger.warn("Can't Bootstrap SQUARE Provider");
    }
    logger.info(`Finished Bootstrap of SquareProvider`);
  }

  CreateOrderCart = async (reference_id : string, 
    cart: CategorizedRebuiltCart, 
    customerInfo: CustomerInfoDto, 
    fulfillmentInfo: FulfillmentDto, 
    completionDateTime: Date | number,
    storeCredit: JSFECreditV2 | null, 
    totals: RecomputeTotalsResult,
    note : string) :
  Promise<{ success: true; result: CreateOrderResponse; error: null; } | 
    { success: false; result: null; error: SquareError[]; }> => {
      // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body : CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        referenceId: reference_id,
        lineItems: Object.values(cart).flatMap(e=>e.map(x=>({
          quantity: x.quantity.toString(10),
          catalogObjectId: VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID,
          basePriceMoney: {
            "amount": BigInt(x.product.m.price * 100),
            "currency": "USD"
          },
          itemType: "ITEM",
          // we don't fill out applied taxes at the item level
          name: x.product.m.name
        } as OrderLineItem))),
        discounts: totals.discountApplied > 0 ? [{ 
          type: "FIXED_AMOUNT",
          amountMoney: { amount: BigInt(totals.discountApplied * 100), currency: CURRENCY.USD },
          appliedMoney: { amount: BigInt(totals.discountApplied * 100), currency: CURRENCY.USD },
          metadata: { 
            "enc": storeCredit.validation.lock.enc,
            "iv": storeCredit.validation.lock.iv,
            "auth": storeCredit.validation.lock.auth,
            "code": storeCredit.code
          }
        }] : [],
        // pricingOptions: {
        //   autoApplyTaxes: true
        // },
        taxes: [{ 
          catalogObjectId: SQUARE_TAX_RATE_CATALOG_ID, 
          appliedMoney: { amount: BigInt(totals.taxAmount * 100), currency: CURRENCY.USD },
          scope: 'ORDER'
        }],
        totalTipMoney: { amount: BigInt(totals.tipAmount * 100), currency: CURRENCY.USD },
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        state: "OPEN",
        fulfillments: [{ 
          type: "PICKUP", 
          pickupDetails: { 
            scheduleType: 'SCHEDULED', 
            recipient: { 
              displayName: `${customerInfo.givenName} ${customerInfo.familyName}`,
              emailAddress: customerInfo.email,
              phoneNumber: customerInfo.mobileNum
            },
            placedAt: formatRFC3339(Date.now()),
            pickupAt: formatRFC3339(completionDateTime),
          }, 
        }],
      }, 
    };
    try {
      logger.info(`sending order request: ${BigIntStringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.createOrder(request_body);
      return { success: true, result: result, error: null };
    } catch (error) {
      if (typeof error === 'object' && Object.hasOwn(error, 'errors')) {
        return { success: false, result: null, error: error.errors as SquareError[] };
      }
      return { success: false, result: null, error: [{category: "API_ERROR", code: "INTERNAL_SERVER_ERROR"}]};
    }
  }

  CreateOrderStoreCredit = async (reference_id: string, amount: IMoney, note: string) :
  Promise<{ success: true; result: CreateOrderResponse; error: null; } | 
    { success: false; result: null; error: SquareError[]; }> => {
      // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body : CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        referenceId: reference_id,
        lineItems: [{
          quantity: "1",
          catalogObjectId: "DNP5YT6QDIWTB53H46F3ECIN",
          basePriceMoney: {
            "amount": BigInt(amount.amount),
            "currency": amount.currency
          },
          note: note
        }],
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        state: "OPEN",
      }
    };
    try {
      logger.info(`sending order request: ${BigIntStringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.createOrder(request_body);
      return { success: true, result: result, error: null };
    } catch (error) {
      try {
        return { success: false, result: null, error: error.errors as SquareError[] };
      } catch (err2) {
        return { success: false, result: null, error: [{category: "API_ERROR", code: "INTERNAL_SERVER_ERROR", detail: 'Internal Server Error. Please reach out for assistance.'}]};
      }
    }
  }

  OrderStateChange = async (square_order_id : string, order_version : number, new_state : string) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body : UpdateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        version: order_version,
        state: new_state,
      }
    };
    try {
      logger.info(`sending order status change request: ${BigIntStringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.updateOrder(square_order_id, request_body);
      return { success: true, response: result };
    } catch (error) {
      logger.error(`Error in order state change: ${BigIntStringify(error)}`);
      return {
        success: false,
        response: error
      };
    }
  }

  ProcessPayment = async (nonce : string, amount: IMoney, reference_id : string, square_order_id : string, verificationToken?: string) : 
    Promise<{ success: true; result: CreditPayment; error: null; } | 
    { success: false; result: null; error: SquareError[]; }> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = this.#client.paymentsApi;
    const request_body : CreatePaymentRequest = {
      sourceId: nonce,
      amountMoney: {
        "amount": BigInt(amount.amount),
        "currency": amount.currency
      },
      referenceId: reference_id,
      orderId: square_order_id,
      locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
      autocomplete: true,
      acceptPartialAuthorization: false,
      statementDescriptionIdentifier: "WCP/BTP Online Order",
      verificationToken,
      idempotencyKey: idempotency_key
    };
    try {
      logger.info(`sending payment request: ${BigIntStringify(request_body)}`);
      const { result, ...httpResponse } = await payments_api.createPayment(request_body);
      if (result.payment && result.payment.status === 'COMPLETED') {
        return { 
          success: true, 
          result: { 
            t: PaymentMethod.CreditCard,
            processor: 'SQUARE',
            createdAt: parseISO(result.payment.createdAt).valueOf(),
            status: TenderBaseStatus.COMPLETED,
            amount: BigIntMoneyToIntMoney(result.payment.amountMoney), 
            billingZip: result.payment.billingAddress.postalCode,
            cardBrand: result.payment.cardDetails.card.cardBrand,
            expYear: result.payment.cardDetails.card.expYear.toString(),
            last4: result.payment.cardDetails.card.last4,
            receiptUrl: result.payment.receiptUrl,
            processorId: result.payment.id,
            cardholderName:  result.payment.cardDetails.card.cardholderName,
          },
          error: null };  
      }
      return {
        success: false,
        result: null,
        error: result.errors ? result.errors : null
      };
    } catch (error) {
      logger.error(`Error in payment request: ${BigIntStringify(error)}`);
      return {
        success: false,
        result: null,
        error: error && error.errors ? error.errors : null
      };
    }
  }
};

const SquareProviderInstance = new SquareProvider();
export default SquareProviderInstance;
module.exports = SquareProviderInstance;