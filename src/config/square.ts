import { Error as SquareError, Client, CreateOrderRequest, CreateOrderResponse, CreatePaymentRequest, Environment, UpdateOrderRequest, OrderLineItem, Money, ApiError, UpdateOrderResponse, PaymentRefund, RefundPaymentRequest, PayOrderRequest, PayOrderResponse, Payment, OrderLineItemModifier, RetrieveOrderResponse, Order, UpsertCatalogObjectRequest, BatchUpsertCatalogObjectsRequest, CatalogObjectBatch, CatalogObject, BatchUpsertCatalogObjectsResponse, UpsertCatalogObjectResponse, BatchDeleteCatalogObjectsRequest, BatchDeleteCatalogObjectsResponse, BatchRetrieveCatalogObjectsRequest, BatchRetrieveCatalogObjectsResponse } from 'square';
import { WProvider } from '../types/WProvider';
import crypto from 'crypto';
import logger from '../logging';
import { DataProviderInstance } from './dataprovider';
import { CatalogProviderInstance } from './catalog_provider';
import { CategorizedRebuiltCart, IMoney, PaymentMethod, WOrderInstance, OrderPayment, PRODUCT_LOCATION, KeyValue, CURRENCY } from '@wcp/wcpshared';
import { formatRFC3339, parseISO } from 'date-fns';
import { StoreCreditPayment } from '@wcp/wcpshared';
import { BigIntMoneyToIntMoney, CreateOrderFromCart, IMoneyToBigIntMoney, MapPaymentStatus, VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID } from './SquareWarioBridge';
import { IS_PRODUCTION } from '../utils';

type SquareProviderApiCallReturnSuccess<T> = { success: true; result: T; error: SquareError[]; };

type SquareProviderApiCallReturnValue<T> = SquareProviderApiCallReturnSuccess<T> |
{ success: false; result: null; error: SquareError[]; };

// LAST WE WERE DOING, USING SQUARE_LOCATION_ALTERNATE to create dummy orders with pickup name `${customer name} ${num} of ${total}` 
// we also want dummy orders sent to indicate cancellations since our cancelations aren't working for the square for restaurants UI
// some of this should go in the SquareWarioBridge

export interface SquareProviderProcessPaymentRequest {
  locationId: string;
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
        environment: IS_PRODUCTION ? Environment.Production : Environment.Sandbox,
        accessToken: DataProviderInstance.KeyValueConfig.SQUARE_TOKEN,
        httpClientOptions: {
          retryConfig: {
            maxNumberOfRetries: 5
          }
        }
      });
    }
    else {
      logger.error("Can't Bootstrap SQUARE Provider");
      return;
    }
    logger.info(`Finished Bootstrap of SquareProvider`);
  }

  CreateOrderCart = async (
    locationId: string,
    reference_id: string,
    orderBeforeCharging: Omit<WOrderInstance, 'id' | 'metadata' | 'status' | 'refunds' | 'locked'>,
    promisedTime: Date | number,
    cart: CategorizedRebuiltCart,
    withFulfillment: boolean): Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
    // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: CreateOrderFromCart(locationId, reference_id, orderBeforeCharging, promisedTime, cart, withFulfillment)
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

  CreateOrderStoreCredit = async (locationId: string, reference_id: string, amount: IMoney, note: string): Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
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
        locationId,
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

  OrderUpdate = async (locationId: string, orderId: string, version: number, updatedOrder: Omit<Partial<Order>, 'locationId' | 'version' | 'id'>, fieldsToClear: string[]) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: UpdateOrderRequest = {
      idempotencyKey: idempotency_key,
      fieldsToClear,
      order: {
        ...updatedOrder,
        locationId,
        version,
      }
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<UpdateOrderResponse>> => {
      logger.info(`sending order update request for order ${orderId}: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.updateOrder(orderId, request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  OrderStateChange = async (locationId: string, orderId: string, version: number, new_state: string) => {
    return this.OrderUpdate(locationId, orderId, version, { state: new_state }, []);
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

  CreatePayment = async ({
    locationId,
    sourceId,
    storeCreditPayment,
    amount,
    referenceId,
    squareOrderId,
    tipAmount,
    verificationToken,
    autocomplete
  }: SquareProviderCreatePaymentRequest): Promise<SquareProviderApiCallReturnValue<OrderPayment>> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = this.#client.paymentsApi;
    const tipMoney = tipAmount ?? { currency: CURRENCY.USD, amount: 0 };
    const request_body: CreatePaymentRequest = {
      sourceId: storeCreditPayment ? "EXTERNAL" : sourceId,
      externalDetails: storeCreditPayment ? { type: 'STORED_BALANCE', source: "WARIO", sourceId: storeCreditPayment.payment.code } : undefined,
      amountMoney: IMoneyToBigIntMoney({ currency: amount.currency, amount: amount.amount - tipMoney.amount }),
      tipMoney: IMoneyToBigIntMoney(tipMoney),
      referenceId: storeCreditPayment ? storeCreditPayment.payment.code : referenceId,
      orderId: squareOrderId,
      locationId,
      autocomplete,
      acceptPartialAuthorization: false,
      statementDescriptionIdentifier: `${DataProviderInstance.KeyValueConfig.STORE_NAME}`.slice(0, 19),
      verificationToken,
      idempotencyKey: idempotency_key
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnValue<OrderPayment>> => {
      logger.info(`sending payment request: ${JSON.stringify(request_body)}`);
      const { result, ..._ } = await payments_api.createPayment(request_body);
      if (result.payment && result.payment.status) {
        const paymentStatus = MapPaymentStatus(result.payment.status);
        const createdAt = parseISO(result.payment.createdAt!).valueOf();
        const processorId = result.payment.id!;
        return {
          success: true,
          result: storeCreditPayment ? {
            ...storeCreditPayment,
            status: paymentStatus,
            payment: {
              ...storeCreditPayment.payment,
              processorId
            }
          } :
            (result.payment.sourceType === 'CASH' ? {
              t: PaymentMethod.Cash,
              createdAt,
              amount: BigIntMoneyToIntMoney(result.payment.totalMoney!),
              tipAmount: tipMoney,
              status: paymentStatus,
              payment: {
                processorId,
                amountTendered: BigIntMoneyToIntMoney(result.payment.cashDetails!.buyerSuppliedMoney),
                change: result.payment.cashDetails!.changeBackMoney ? BigIntMoneyToIntMoney(result.payment.cashDetails!.changeBackMoney) : { currency: amount.currency, amount: 0 },
              },
            } : {
              t: PaymentMethod.CreditCard,
              createdAt,
              amount: BigIntMoneyToIntMoney(result.payment.amountMoney!),
              tipAmount: tipMoney,
              status: paymentStatus,
              payment: {
                processor: 'SQUARE',
                billingZip: result.payment.billingAddress?.postalCode ?? undefined,
                cardBrand: result.payment.cardDetails?.card?.cardBrand ?? undefined,
                expYear: result.payment.cardDetails?.card?.expYear?.toString(),
                last4: result.payment.cardDetails?.card?.last4 ?? "",
                receiptUrl: result.payment.receiptUrl ?? `https://squareup.com/receipt/preview/${result.payment.id}`,
                processorId,
                cardholderName: result.payment.cardDetails?.card?.cardholderName ?? undefined,
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

  ProcessPayment = async ({ locationId, sourceId, amount, referenceId, squareOrderId, verificationToken }: SquareProviderProcessPaymentRequest) => {
    return await this.CreatePayment({ locationId, sourceId, amount, referenceId, squareOrderId, verificationToken, autocomplete: true });
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
      return { success: true, result: result, error: [] };
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

  UpsertCatalogObject = async (object: CatalogObject) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const catalogApi = this.#client.catalogApi;
    const request_body: UpsertCatalogObjectRequest = {
      idempotencyKey: idempotency_key,
      object
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<UpsertCatalogObjectResponse>> => {
      logger.info(`sending catalog upsert: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await catalogApi.upsertCatalogObject(request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  BatchUpsertCatalogObjects = async (objectBatches: CatalogObjectBatch[]) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const catalogApi = this.#client.catalogApi;
    const request_body: BatchUpsertCatalogObjectsRequest = {
      idempotencyKey: idempotency_key,
      batches: objectBatches
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<BatchUpsertCatalogObjectsResponse>> => {
      logger.info(`sending catalog upsert batch: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await catalogApi.batchUpsertCatalogObjects(request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  BatchDeleteCatalogObjects = async (objectIds: string[]) => {
    const catalogApi = this.#client.catalogApi;
    const request_body: BatchDeleteCatalogObjectsRequest = {
      objectIds
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<BatchDeleteCatalogObjectsResponse>> => {
      logger.info(`sending catalog delete batch: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await catalogApi.batchDeleteCatalogObjects(request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  BatchRetrieveCatalogObjects = async (objectIds: string[], includeRelated: boolean) => {
    const catalogApi = this.#client.catalogApi;
    const request_body: BatchRetrieveCatalogObjectsRequest = {
      objectIds,
      includeRelatedObjects: includeRelated
    };

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<BatchRetrieveCatalogObjectsResponse>> => {
      logger.info(`sending catalog retrieve batch: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await catalogApi.batchRetrieveCatalogObjects(request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }
};

export const SquareProviderInstance = new SquareProvider();