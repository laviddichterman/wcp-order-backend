import { Error as SquareError, Client, CreateOrderRequest, CreateOrderResponse, CreatePaymentRequest, Environment, UpdateOrderRequest, OrderLineItem, Money, ApiError, UpdateOrderResponse, PaymentRefund, CreateRefundRequest, RefundPaymentRequest } from 'square';
import { WProvider } from '../types/WProvider';
import crypto from 'crypto';
import logger from '../logging';
import { DataProviderInstance } from './dataprovider';
import { CategorizedRebuiltCart, IMoney, CreditPayment, PaymentMethod, TenderBaseStatus, WOrderInstance } from '@wcp/wcpshared';
import { ExponentialBackoff } from '../utils';
import { formatRFC3339, parseISO } from 'date-fns';

const SQUARE_TAX_RATE_CATALOG_ID = "TMG7E3E5E45OXHJTBOHG2PMS";
const VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID = "DNP5YT6QDIWTB53H46F3ECIN";

export const BigIntMoneyToIntMoney = (bigIntMoney: Money): IMoney => ({ amount: Number(bigIntMoney.amount!), currency: bigIntMoney.currency! });

export const IMoneyToBigIntMoney = (money: IMoney): Money => ({ amount: BigInt(money.amount), currency: money.currency });

type SquareProviderApiCallReturnSuccess<T> = { success: true; result: T; error: SquareError[]; };

type SquareProviderApiCallReturnValue<T> = SquareProviderApiCallReturnSuccess<T> |
{ success: false; result: null; error: SquareError[]; };

export interface SquareProviderCreatePaymentRequest { 
  nonce: string;
  amount: IMoney;
  referenceId: string;
  squareOrderId: string; 
  verificationToken?: string
};

const SquareExponentialBackoffHandler = async <T>(apiRequestMaker: ()=> Promise<SquareProviderApiCallReturnValue<T>>, retry: number, maxRetry: number) => {
  const call_fxn = async (): Promise<{ success: true; result: T; error: SquareError[]; } | 
  { success: false; result: null; error: SquareError[]; }> => {
    try { 
      return await apiRequestMaker();
    }
    catch (error) {
      if (error instanceof ApiError) {
        throw { success: false, result: null, error: error.errors as SquareError[] };
      }
      throw { success: false, result: null, error: [{category: "API_ERROR", code: "INTERNAL_SERVER_ERROR", detail: 'Internal Server Error. Please reach out for assistance.'}]};
    }  
  }
  return await ExponentialBackoff(call_fxn, (err) => {
    if (err instanceof ApiError) {
      const errors = err.errors ?? [];
      if (errors.length === 1 && errors[0].category === 'API_ERROR') {
        return true;
      }
      return false;
    }
    return true;
  }, retry, maxRetry);
}

export class SquareProvider implements WProvider {
  #client: Client;
  constructor() {
  }

  Bootstrap = () => {
    logger.info(`Starting Bootstrap of SquareProvider`);
    if (DataProviderInstance.KeyValueConfig.SQUARE_TOKEN) {
      this.#client = new Client({
        environment: Environment.Production, // `Environment.Sandbox` to access sandbox resources // TODO: configure this
        accessToken: DataProviderInstance.KeyValueConfig.SQUARE_TOKEN,
        // httpClientOptions: {
        //   retryConfig: {
        //    maxNumberOfRetries: 5
        //   }
        // }
      });
    }
    else {
      logger.warn("Can't Bootstrap SQUARE Provider");
    }
    logger.info(`Finished Bootstrap of SquareProvider`);
  }



  

  CreateOrderCart = async (reference_id : string, 
    orderBeforeCharging: Omit<WOrderInstance, 'id' | 'metadata' | 'status' | 'refunds'>,
    tipAmount: IMoney,
    promisedTime: Date | number,
    cart: CategorizedRebuiltCart, 
    note : string,
    retry: number = 0,
    maxRetry: number = 5) : Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
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
          basePriceMoney: IMoneyToBigIntMoney(x.product.m.price),
          itemType: "ITEM",
          // we don't fill out applied taxes at the item level
          name: x.product.m.name
        } as OrderLineItem))),
        discounts: [...orderBeforeCharging.discounts.map(discount => ({ 
          type: 'VARIABLE_AMOUNT',
          scope: 'ORDER',
          catalogObjectId: 'AKIYDPB5WJD2HURCWWZSAIF5',
          name: `Discount Code: ${discount.discount.code}`,
          amountMoney: IMoneyToBigIntMoney(discount.discount.amount),
          appliedMoney: IMoneyToBigIntMoney(discount.discount.amount),
          metadata: { 
            enc: discount.discount.lock.enc,
            iv: discount.discount.lock.iv,
            auth: discount.discount.lock.auth,
            code: discount.discount.code
          }
        })),
        // we apply these non-square payments of store credit that were purchased with square
        // accounting will need to address this later
        ...orderBeforeCharging.payments.map(nonSquarePayment => ({ 
          type: "FIXED_AMOUNT",
          amountMoney: IMoneyToBigIntMoney(nonSquarePayment.amount),
          appliedMoney: IMoneyToBigIntMoney(nonSquarePayment.amount),
          metadata: (nonSquarePayment.t === PaymentMethod.StoreCredit ? {
            code: nonSquarePayment.payment.code,
            ...nonSquarePayment.payment.lock
          }  : {})
        })),
        ],
        pricingOptions: {
          autoApplyDiscounts: true,
          autoApplyTaxes: true
        },
        taxes: orderBeforeCharging.taxes.map(tax=>({ 
          catalogObjectId: SQUARE_TAX_RATE_CATALOG_ID, 
          appliedMoney: IMoneyToBigIntMoney(tax.amount),
          scope: 'ORDER'
        })),
        totalTipMoney: IMoneyToBigIntMoney(tipAmount),
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        state: "OPEN",
        fulfillments: [{ 
          type: "PICKUP", 
          pickupDetails: { 
            scheduleType: 'SCHEDULED', 
            recipient: { 
              displayName: `${orderBeforeCharging.customerInfo.givenName} ${orderBeforeCharging.customerInfo.familyName}`,
              emailAddress: orderBeforeCharging.customerInfo.email,
              phoneNumber: orderBeforeCharging.customerInfo.mobileNum
            },
            placedAt: formatRFC3339(Date.now()),
            pickupAt: formatRFC3339(promisedTime),
          }, 
        }],
      }, 
    };
    const call_fxn = async (): Promise<SquareProviderApiCallReturnSuccess<CreateOrderResponse>> => {
        logger.info(`sending order request: ${JSON.stringify(request_body)}`);
        const { result, ...httpResponse } = await orders_api.createOrder(request_body);
        return { success: true, result: result, error: [] };
    }
    return await SquareExponentialBackoffHandler(call_fxn, retry, maxRetry);
  }

  CreateOrderStoreCredit = async (reference_id: string, amount: IMoney, note: string, retry: number = 0,
    maxRetry: number = 5): Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
    // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        referenceId: reference_id,
        lineItems: [{
          quantity: "1",
          catalogObjectId: "DNP5YT6QDIWTB53H46F3ECIN",
          basePriceMoney: IMoneyToBigIntMoney(amount),
          note: note
        }],
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        state: "OPEN",
      }
    };

    const callFxn = async (): Promise<{ success: true; result: CreateOrderResponse; error: null; }> => {
      logger.info(`sending order request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.createOrder(request_body);
      return { success: true, result: result, error: null };
    }
    return await SquareExponentialBackoffHandler(callFxn, retry, maxRetry);
  }

  OrderStateChange = async (square_order_id: string, order_version: number, new_state: string, retry: number = 0,
    maxRetry: number = 5) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: UpdateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        version: order_version,
        state: new_state,
      }
    };
    
    const callFxn = async (): Promise<{ success: true; result: UpdateOrderResponse; error: null; }> => {
      logger.info(`sending order status change request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.updateOrder(square_order_id, request_body);
      return { success: true, result: result, error: null };
    }
    return await SquareExponentialBackoffHandler(callFxn, retry, maxRetry);
  }

  ProcessPayment = async (
    { nonce, amount, referenceId, squareOrderId, verificationToken } : SquareProviderCreatePaymentRequest, 
    retry: number = 0,
    maxRetry: number = 5): Promise<SquareProviderApiCallReturnValue<CreditPayment>> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = this.#client.paymentsApi;
    const request_body: CreatePaymentRequest = {
      sourceId: nonce,
      amountMoney: IMoneyToBigIntMoney(amount),
      referenceId,
      orderId: squareOrderId,
      locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
      autocomplete: true,
      acceptPartialAuthorization: false,
      statementDescriptionIdentifier: "WCP/BTP Online Order",
      verificationToken,
      idempotencyKey: idempotency_key
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnValue<CreditPayment>> => {
      logger.info(`sending payment request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await payments_api.createPayment(request_body);
      if (result.payment && result.payment.status === 'COMPLETED') {
        return {
          success: true,
          result: {
            t: PaymentMethod.CreditCard,
            createdAt: parseISO(result.payment.createdAt).valueOf(),
            amount: BigIntMoneyToIntMoney(result.payment.amountMoney),
            status: TenderBaseStatus.COMPLETED,
            payment: {
              processor: 'SQUARE',
              billingZip: result.payment.billingAddress?.postalCode ?? undefined,
              cardBrand: result.payment.cardDetails.card.cardBrand ?? undefined,
              expYear: result.payment.cardDetails.card.expYear.toString(),
              last4: result.payment.cardDetails.card.last4,
              receiptUrl: result.payment.receiptUrl,
              processorId: result.payment.id,
              cardholderName: result.payment.cardDetails.card.cardholderName ?? undefined,
            }
          },
          error: []
        };
      }
      return {
        success: false,
        result: null,
        error: result.errors ?? []
      };
    }
    return await SquareExponentialBackoffHandler(callFxn, retry, maxRetry);
  }

  RefundPayment = async (creditPayment: CreditPayment, reason: string,
    retry: number = 0,
    maxRetry: number = 5): Promise<SquareProviderApiCallReturnValue<CreditPayment>> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const refundsApi = this.#client.refundsApi;
    const request_body: RefundPaymentRequest = {
      reason,
      amountMoney: IMoneyToBigIntMoney(creditPayment.amount),
      idempotencyKey: idempotency_key,
      paymentId: creditPayment.payment.processorId,
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnValue<CreditPayment>> => {
      logger.info(`sending payment REFUND request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await refundsApi.refundPayment(request_body);
      if (result.refund && result.refund.status !== 'REJECTED' && result.refund.status !== 'FAILED') {
        return {
          success: true,
          result: {
            t: PaymentMethod.CreditCard,
            createdAt: parseISO(result.refund.createdAt).valueOf(),
            amount: BigIntMoneyToIntMoney(result.refund.amountMoney),
            status: TenderBaseStatus.COMPLETED,
            payment: {
              ...creditPayment.payment,
              processorId: result.refund.id,
            }
          },
          error: []
        };
      }
      return {
        success: false,
        result: null,
        error: result.errors ?? []
      };
    }
    return await SquareExponentialBackoffHandler(callFxn, retry, maxRetry);
  }
};

export const SquareProviderInstance = new SquareProvider();