import { Error as SquareError, Client, CreateOrderRequest, CreateOrderResponse, CreatePaymentRequest, CreatePaymentResponse, Environment, UpdateOrderRequest, OrderLineItem } from 'square';
import { WProvider } from '../types/WProvider';
import crypto from 'crypto';
import logger from'../logging';
import DataProviderInstance from './dataprovider';
import { BigIntStringify } from '../utils';
import { CategorizedRebuiltCart, CURRENCY, CustomerInfoDto, FulfillmentDto, JSFECreditV2 } from '@wcp/wcpshared';
import { RecomputeTotalsResult } from './order_manager';
import { formatRFC3339 } from 'date-fns';

const SQUARE_TAX_RATE_CATALOG_ID = "TMG7E3E5E45OXHJTBOHG2PMS";
const VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID = "DNP5YT6QDIWTB53H46F3ECIN";

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

  // interface RecomputeTotalsArgs {
  //   cart: CategorizedRebuiltCart;
  //   creditResponse: ValidateAndLockCreditResponse;
  //   fulfillment: FulfillmentDto;
  //   totals: TotalsV2;
  // }
  
  // interface RecomputeTotalsResult {
  //   mainCategoryProductCount: number;
  //   cartSubtotal: number;
  //   deliveryFee: number;
  //   subtotal: number;
  //   discountApplied: number;
  //   taxAmount: number;
  //   tipBasis: number;
  //   tipMinimum: number;
  //   total: number;
  //   giftCartApplied: number;
  //   balanceAfterCredits: number;
  // }
  // const RecomputeTotals = function ({ cart, creditResponse, fulfillment, totals }: RecomputeTotalsArgs): RecomputeTotalsResult {
  //   const cfg = DataProviderInstance.Settings.config;
  //   const MAIN_CATID = cfg.MAIN_CATID as string;
  //   const DELIVERY_FEE = cfg.DELIVERY_FEE as number;
  //   const TAX_RATE = cfg.TAX_RATE as number;
  //   const AUTOGRAT_THRESHOLD = cfg.AUTOGRAT_THRESHOLD as number;
  
  //   const mainCategoryProductCount = Object.hasOwn(cart, MAIN_CATID) ? cart[MAIN_CATID].reduce((acc, e) => acc + e.quantity, 0) : 0;
  //   const cartSubtotal = Object.values(cart).reduce((acc, c) => acc + ComputeCartSubTotal(c), 0);
  //   const deliveryFee = fulfillment.deliveryInfo !== null && fulfillment.deliveryInfo.validation.validated_address ? DELIVERY_FEE : 0;
  //   const subtotal = cartSubtotal + deliveryFee;
  //   const discountApplied = ComputeDiscountApplied(subtotal, creditResponse);
  //   const taxAmount = ComputeTaxAmount(subtotal, TAX_RATE, discountApplied);
  //   const tipBasis = ComputeTipBasis(subtotal, taxAmount);
  //   const tipMinimum = mainCategoryProductCount >= AUTOGRAT_THRESHOLD ? ComputeTipValue({ isPercentage: true, isSuggestion: true, value: .2 }, tipBasis) : 0;
  //   const total = ComputeTotal(subtotal, discountApplied, taxAmount, totals.tip);
  //   const giftCartApplied = ComputeGiftCardApplied(total, creditResponse);
  //   const balanceAfterCredits = ComputeBalanceAfterCredits(total, giftCartApplied);
  //   return {
  //     mainCategoryProductCount,
  //     cartSubtotal,
  //     deliveryFee,
  //     subtotal,
  //     discountApplied,
  //     taxAmount,
  //     tipBasis,
  //     tipMinimum,
  //     total,
  //     giftCartApplied,
  //     balanceAfterCredits
  //   };
  // }

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

  CreateOrderStoreCredit = async (reference_id : string, amount_money : bigint, note : string) :
  Promise<{ success: true; result: CreateOrderResponse; error: null; } | 
    { success: false; result: null; error: SquareError[]; }> => {
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
            "amount": amount_money,
            "currency": "USD"
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

  ProcessPayment = async (nonce : string, amount_money : bigint, reference_id : string, square_order_id : string, verificationToken?: string) : 
    Promise<{ success: true; result: CreatePaymentResponse; error: null; } | 
    { success: false; result: null; error: SquareError[]; }> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = this.#client.paymentsApi;
    const request_body : CreatePaymentRequest = {
      sourceId: nonce,
      amountMoney: {
        amount: amount_money,
        currency: 'USD'
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
      return { success: true, result: result, error: null };
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