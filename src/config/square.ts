import { Error as SquareError, Client, CreateOrderRequest, CreateOrderResponse, CreatePaymentRequest, Environment, UpdateOrderRequest, OrderLineItem, Money, ApiError, UpdateOrderResponse, PaymentRefund, RefundPaymentRequest, PayOrderRequest, PayOrderResponse, Payment, OrderLineItemModifier, RetrieveOrderResponse, Order } from 'square';
import { WProvider } from '../types/WProvider';
import crypto from 'crypto';
import logger from '../logging';
import { DataProviderInstance } from './dataprovider';
import { CatalogProviderInstance } from './catalog_provider';
import { CategorizedRebuiltCart, IMoney, PaymentMethod, TenderBaseStatus, WOrderInstance, OrderPayment, PRODUCT_LOCATION } from '@wcp/wcpshared';
import { formatRFC3339, parseISO } from 'date-fns';
import { StoreCreditPayment } from '@wcp/wcpshared';

const SQUARE_TAX_RATE_CATALOG_ID = "TMG7E3E5E45OXHJTBOHG2PMS";
const VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID = "DNP5YT6QDIWTB53H46F3ECIN";

export const BigIntMoneyToIntMoney = (bigIntMoney: Money): IMoney => ({ amount: Number(bigIntMoney.amount!), currency: bigIntMoney.currency! });

export const IMoneyToBigIntMoney = (money: IMoney): Money => ({ amount: BigInt(money.amount), currency: money.currency });

function MapPaymentStatus(sqStatus: string) {
  switch (sqStatus) {
    case 'APPROVED':
    case 'PENDING':
      return TenderBaseStatus.AUTHORIZED;
    case 'COMPLETED':
      return TenderBaseStatus.COMPLETED;
    case 'CANCELED':
    case 'FAILED':
      return TenderBaseStatus.CANCELED;
  }
  return TenderBaseStatus.CANCELED;
}

type SquareProviderApiCallReturnSuccess<T> = { success: true; result: T; error: SquareError[]; };

type SquareProviderApiCallReturnValue<T> = SquareProviderApiCallReturnSuccess<T> |
{ success: false; result: null; error: SquareError[]; };

export interface SquareProviderProcessPaymentRequest {
  sourceId: string;
  amount: IMoney;
  referenceId: string;
  squareOrderId: string;
  verificationToken?: string
};

export interface SquareProviderCreatePaymentRequest extends SquareProviderProcessPaymentRequest {
  storeCreditPayment?: StoreCreditPayment;
  tipAmount?: IMoney;
  autocomplete: boolean;
};


const SquareRequestHandler = async <T>(apiRequestMaker: () => Promise<SquareProviderApiCallReturnValue<T>>) => {
  const call_fxn = async (): Promise<{ success: true; result: T; error: SquareError[]; } |
  { success: false; result: null; error: SquareError[]; }> => {
    try {
      return await apiRequestMaker();
    }
    catch (error) {
      if (error instanceof ApiError) {
        return { success: false, result: null, error: error.errors as SquareError[] };
      }
      return { success: false, result: null, error: [{ category: "API_ERROR", code: "INTERNAL_SERVER_ERROR", detail: 'Internal Server Error. Please reach out for assistance.' }] };
    }
  }
  return await call_fxn();
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
        httpClientOptions: {
          retryConfig: {
            maxNumberOfRetries: 5
          }
        }
      });
    }
    else {
      logger.warn("Can't Bootstrap SQUARE Provider");
    }
    logger.info(`Finished Bootstrap of SquareProvider`);
  }

  CreateOrderCart = async (reference_id: string,
    orderBeforeCharging: Omit<WOrderInstance, 'id' | 'metadata' | 'status' | 'refunds' | 'locked'>,
    promisedTime: Date | number,
    cart: CategorizedRebuiltCart,
    note: string): Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
    // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        referenceId: reference_id,
        lineItems: Object.values(cart).flatMap(e => e.map(x => {
          // left and right catalog product instance are the same, 
          if (x.product.m.pi[PRODUCT_LOCATION.LEFT] === x.product.m.pi[PRODUCT_LOCATION.RIGHT]) {
            const catalogProductInstance = CatalogProviderInstance.Catalog.productInstances[x.product.m.pi[PRODUCT_LOCATION.LEFT]];
            const wholeModifiers: OrderLineItemModifier[] = x.product.m.exhaustive_modifiers.whole.map(mtid_moid => {
              const catalogOption = CatalogProviderInstance.Catalog.options[mtid_moid[1]];
              return { basePriceMoney: IMoneyToBigIntMoney(catalogOption.price), name: catalogOption.displayName }
            })
          } else { // left and right catalog product instance aren't the same. this isn't really supported by square, so we'll do our best
            // TODO: grab a special square variation item ID or use the base product's ID
          }
          return {
            quantity: x.quantity.toString(10),
            //catalogObjectId: VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID,
            basePriceMoney: IMoneyToBigIntMoney(x.product.p.PRODUCT_CLASS.price),
            itemType: "ITEM",
            name: x.product.m.name, // its either catalogObjectId or name
            modifiers: x.product.p.modifiers.flatMap(mod => mod.options.map(option => {
              const catalogOption = CatalogProviderInstance.Catalog.options[option.optionId];
              return { basePriceMoney: IMoneyToBigIntMoney(catalogOption.price), name: catalogOption.displayName }
            }))
          } as OrderLineItem;
        })),
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
          // // we apply these non-square payments of store credit that were purchased with square
          // // accounting will need to address this later
          // ...orderBeforeCharging.payments.map(nonSquarePayment => ({
          //   type: "FIXED_AMOUNT",
          //   name: nonSquarePayment.t === PaymentMethod.StoreCredit ? `Gift Code: ${nonSquarePayment.payment.code}` : 'Cash',
          //   amountMoney: IMoneyToBigIntMoney(nonSquarePayment.amount),
          //   appliedMoney: IMoneyToBigIntMoney(nonSquarePayment.amount),
          //   metadata: (nonSquarePayment.t === PaymentMethod.StoreCredit ? {
          //     code: nonSquarePayment.payment.code,
          //     ...nonSquarePayment.payment.lock
          //   } : {})
          // })),
        ],
        pricingOptions: {
          autoApplyDiscounts: true,
          autoApplyTaxes: true
        },
        taxes: orderBeforeCharging.taxes.map(tax => ({
          catalogObjectId: SQUARE_TAX_RATE_CATALOG_ID,
          appliedMoney: IMoneyToBigIntMoney(tax.amount),
          scope: 'ORDER'
        })),
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
            pickupAt: formatRFC3339(promisedTime),
          },
        }],
      },
    };
    const call_fxn = async (): Promise<SquareProviderApiCallReturnSuccess<CreateOrderResponse>> => {
      try {
        logger.info(`sending order request: ${JSON.stringify(request_body)}`);
        const { result, ...httpResponse } = await orders_api.createOrder(request_body);
        return { success: true, result: result, error: [] };
      } catch (err: any) {
        logger.error(`Failed order request with ${JSON.stringify(err)}`);
        throw err;
      }
    }
    //return await call_fxn();
    return await SquareRequestHandler(call_fxn);
  }

  CreateOrderStoreCredit = async (reference_id: string, amount: IMoney, note: string): Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
    // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: {
        referenceId: reference_id,
        lineItems: [{
          quantity: "1",
          catalogObjectId: VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID,
          basePriceMoney: IMoneyToBigIntMoney(amount),
          note: note
        }],
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        state: "OPEN",
      }
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<CreateOrderResponse>> => {
      logger.info(`sending order request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.createOrder(request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  OrderUpdate = async (orderId: string, version: number, updatedOrder: Omit<Partial<Order>, 'locationId' | 'version' | 'id'>, fieldsToClear: string[]) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: UpdateOrderRequest = {
      idempotencyKey: idempotency_key,
      fieldsToClear,
      order: {
        ...updatedOrder,
        locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
        version,
      }
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<UpdateOrderResponse>> => {
      logger.info(`sending order status change request for order ${orderId}: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.updateOrder(orderId, request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  OrderStateChange = async (orderId: string, version: number, new_state: string) => {
    return this.OrderUpdate(orderId, version, { state: new_state }, []);
  }

  RetrieveOrder = async (squareOrderId: string) => {
    const orders_api = this.#client.ordersApi;
    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<RetrieveOrderResponse>> => {
      logger.info(`Getting Square Order with ID: ${squareOrderId}`);
      const { result, ...httpResponse } = await orders_api.retrieveOrder(squareOrderId);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  CreatePayment = async (
    { sourceId, storeCreditPayment, amount, referenceId, squareOrderId, tipAmount, verificationToken, autocomplete }: SquareProviderCreatePaymentRequest): Promise<SquareProviderApiCallReturnValue<OrderPayment>> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = this.#client.paymentsApi;
    const request_body: CreatePaymentRequest = {
      sourceId: storeCreditPayment ? "EXTERNAL" : sourceId,
      externalDetails: storeCreditPayment ? { type: 'STORED_BALANCE', source: "WARIO", sourceId: storeCreditPayment.payment.code } : undefined,
      amountMoney: IMoneyToBigIntMoney({ currency: amount.currency, amount: amount.amount - (tipAmount?.amount ?? 0) }),
      tipMoney: tipAmount ? IMoneyToBigIntMoney(tipAmount) : undefined,
      referenceId: storeCreditPayment ? storeCreditPayment.payment.code : referenceId,
      orderId: squareOrderId,
      locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
      autocomplete,
      acceptPartialAuthorization: false,
      statementDescriptionIdentifier: `${DataProviderInstance.KeyValueConfig.STORE_NAME}`.slice(0, 19),
      verificationToken,
      idempotencyKey: idempotency_key
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnValue<OrderPayment>> => {
      logger.info(`sending payment request: ${JSON.stringify(request_body)}`);
      const { result, ..._ } = await payments_api.createPayment(request_body);
      if (result.payment) {
        const paymentStatus = MapPaymentStatus(result.payment.status);
        return {
          success: true,
          result: storeCreditPayment ? {
              ...storeCreditPayment,
              status: paymentStatus,
              payment: {
                ...storeCreditPayment.payment,
                processorId: result.payment.id
              }
            } :
            (result.payment.sourceType === 'CASH' ? {
              t: PaymentMethod.Cash,
              createdAt: parseISO(result.payment.createdAt).valueOf(),
              amount: BigIntMoneyToIntMoney(result.payment.totalMoney),
              tipAmount,
              status: paymentStatus,
              payment: {
                processorId: result.payment.id,
                amountTendered: BigIntMoneyToIntMoney(result.payment.cashDetails!.buyerSuppliedMoney),
                change: result.payment.cashDetails!.changeBackMoney ? BigIntMoneyToIntMoney(result.payment.cashDetails!.changeBackMoney) : { currency: amount.currency, amount: 0 },
              },
            } : {
              t: PaymentMethod.CreditCard,
              createdAt: parseISO(result.payment.createdAt).valueOf(),
              amount: BigIntMoneyToIntMoney(result.payment.amountMoney),
              tipAmount,
              status: paymentStatus,
              payment: {
                processor: 'SQUARE',
                billingZip: result.payment.billingAddress?.postalCode ?? undefined,
                cardBrand: result.payment.cardDetails.card.cardBrand ?? undefined,
                expYear: result.payment.cardDetails.card.expYear.toString(),
                last4: result.payment.cardDetails.card.last4,
                receiptUrl: result.payment.receiptUrl ?? `https://squareup.com/receipt/preview/${result.payment.id}`,
                processorId: result.payment.id,
                cardholderName: result.payment.cardDetails.card.cardholderName ?? undefined,
              }
            }),
          error: []
        };
      }
      return {
        success: false,
        result: null,
        error: result.errors ?? []
      };
    }
    return await SquareRequestHandler(callFxn);
  }

  ProcessPayment = async ({ sourceId, amount, referenceId, squareOrderId, verificationToken }: SquareProviderProcessPaymentRequest) => {
    return await this.CreatePayment({ sourceId, amount, referenceId, squareOrderId, verificationToken, autocomplete: true });
  }

  PayOrder = async (square_order_id: string, paymentIds: string[]) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: PayOrderRequest = {
      idempotencyKey: idempotency_key,
      paymentIds
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<PayOrderResponse>> => {
      logger.info(`sending order payment request ${square_order_id}: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.payOrder(square_order_id, request_body);
      return { success: true, result: result, error: null };
    }
    return await SquareRequestHandler(callFxn);
  }

  RefundPayment = async (squarePaymentId: string, amount: IMoney, reason: string): Promise<SquareProviderApiCallReturnValue<PaymentRefund>> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const refundsApi = this.#client.refundsApi;
    const request_body: RefundPaymentRequest = {
      reason,
      amountMoney: IMoneyToBigIntMoney(amount),
      idempotencyKey: idempotency_key,
      paymentId: squarePaymentId,
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnValue<PaymentRefund>> => {
      logger.info(`sending payment REFUND request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await refundsApi.refundPayment(request_body);
      if (result.refund && result.refund.status !== 'REJECTED' && result.refund.status !== 'FAILED') {
        return {
          success: true,
          result: result.refund,
          error: []
        };
      }
      return {
        success: false,
        result: null,
        error: result.errors ?? []
      };
    }
    return await SquareRequestHandler(callFxn);
  }

  CancelPayment = async (squarePaymentId: string): Promise<SquareProviderApiCallReturnValue<Payment>> => {
    const paymentsApi = this.#client.paymentsApi;
    const callFxn = async (): Promise<SquareProviderApiCallReturnValue<Payment>> => {
      logger.info(`sending payment CANCEL request for: ${squarePaymentId}`);
      const { result, ...httpResponse } = await paymentsApi.cancelPayment(squarePaymentId);
      if (result.payment && result.payment.status === 'CANCELED') {
        return {
          success: true,
          result: result.payment,
          error: []
        };
      }
      return {
        success: false,
        result: null,
        error: result.errors ?? []
      };
    }
    return await SquareRequestHandler(callFxn);
  }
};

export const SquareProviderInstance = new SquareProvider();