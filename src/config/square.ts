import { Error as SquareError, Client, CreateOrderRequest, CreateOrderResponse, CreatePaymentRequest, Environment, UpdateOrderRequest, ApiError, UpdateOrderResponse, PaymentRefund, RefundPaymentRequest, PayOrderRequest, PayOrderResponse, Payment, RetrieveOrderResponse, Order, UpsertCatalogObjectRequest, BatchUpsertCatalogObjectsRequest, CatalogObjectBatch, CatalogObject, BatchUpsertCatalogObjectsResponse, UpsertCatalogObjectResponse, BatchDeleteCatalogObjectsRequest, BatchDeleteCatalogObjectsResponse, BatchRetrieveCatalogObjectsRequest, BatchRetrieveCatalogObjectsResponse, CatalogInfoResponseLimits, SearchCatalogItemsRequest, SearchCatalogItemsResponse, SearchCatalogObjectsRequest, SearchCatalogObjectsResponse, ListCatalogResponse } from 'square';
import { WProvider } from '../types/WProvider';
import crypto from 'crypto';
import logger from '../logging';
import { DataProviderInstance } from './dataprovider';
import { IMoney, PaymentMethod, OrderPayment, CURRENCY, TenderBaseStatus } from '@wcp/wcpshared';
import { parseISO } from 'date-fns';
import { StoreCreditPayment } from '@wcp/wcpshared';
import { BigIntMoneyToIntMoney, IMoneyToBigIntMoney, MapPaymentStatus } from './SquareWarioBridge';
import { ExponentialBackoff, IS_PRODUCTION } from '../utils';
import { RetryConfiguration } from 'square/dist/core';

export const SQUARE_BATCH_CHUNK_SIZE = process.env.WARIO_SQUARE_BATCH_CHUNK_SIZE ? parseInt(process.env.WARIO_SQUARE_BATCH_CHUNK_SIZE) : 25;

type SquareProviderApiCallReturnSuccess<T> = { success: true; result: T; error: SquareError[]; };

type SquareProviderApiCallReturnValue<T> = SquareProviderApiCallReturnSuccess<T> |
{ success: false; result: null; error: SquareError[]; };


const DEFAULT_LIMITS: Required<CatalogInfoResponseLimits> = {
  batchDeleteMaxObjectIds: 200,
  batchRetrieveMaxObjectIds: 1000,
  batchUpsertMaxObjectsPerBatch: 1000,
  batchUpsertMaxTotalObjects: 10000,
  searchMaxPageLimit: 1000,
  updateItemModifierListsMaxItemIds: 1000,
  updateItemModifierListsMaxModifierListsToDisable: 1000,
  updateItemModifierListsMaxModifierListsToEnable: 1000,
  updateItemTaxesMaxItemIds: 1000,
  updateItemTaxesMaxTaxesToDisable: 1000,
  updateItemTaxesMaxTaxesToEnable: 1000
};

/**
 * CURRENTLY:
 * - need to bootstrap square catalog in SquareConfigSchema
 * - need to switch to an exponential backoff situation that works
 */

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
      const errorDetail = `Got unknown error: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`;
      logger.error(errorDetail)
      return { success: false, result: null, error: [{ category: "API_ERROR", code: "INTERNAL_SERVER_ERROR", detail: 'Internal Server Error. Please reach out for assistance.' }] };
    }
  }
  return await call_fxn();
}

const SQUARE_RETRY_CONFIG: RetryConfiguration = {
  maxNumberOfRetries: 5,
  retryOnTimeout: true,
  retryInterval: 1,
  maximumRetryWaitTime: 0,
  backoffFactor: 3,
  httpStatusCodesToRetry: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524],
  httpMethodsToRetry: ['GET', 'PUT']
};

export class SquareProvider implements WProvider {
  #client: Client;
  #catalogLimits: Required<CatalogInfoResponseLimits>;
  constructor() {
    this.#catalogLimits = DEFAULT_LIMITS;
  }

  Bootstrap = async () => {
    logger.info(`Starting Bootstrap of SquareProvider`);
    if (DataProviderInstance.KeyValueConfig.SQUARE_TOKEN) {
      this.#client = new Client({
        environment: IS_PRODUCTION ? Environment.Production : Environment.Sandbox,
        accessToken: DataProviderInstance.KeyValueConfig.SQUARE_TOKEN,
        httpClientOptions: {
          retryConfig: SQUARE_RETRY_CONFIG
        }
      });
    }
    else {
      logger.error("Can't Bootstrap SQUARE Provider, failed creating client");
      return;
    }
    const catalogInfoLimitsResponse = await this.GetCatalogInfo();
    if (catalogInfoLimitsResponse.success) {
      this.#catalogLimits = {
        ...DEFAULT_LIMITS,
        ...catalogInfoLimitsResponse.result
      };
    } else {
      logger.error("Can't Bootstrap SQUARE Provider, failed querying catalog limits");
      return;
    }

    logger.info(`Finished Bootstrap of SquareProvider`);
  }

  GetCatalogInfo = async (): Promise<SquareProviderApiCallReturnValue<CatalogInfoResponseLimits>> => {
    const api = this.#client.catalogApi;
    const call_fxn = async (): Promise<SquareProviderApiCallReturnSuccess<CatalogInfoResponseLimits>> => {
      logger.info('sending Catalog Info request to Square API');
      const { result, ...httpResponse } = await api.catalogInfo();
      return { success: true, result: result.limits!, error: [] };
    }
    return await SquareRequestHandler(call_fxn);
  }

  CreateOrder = async (order: Order): Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
    // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: order
    };
    const call_fxn = async (): Promise<SquareProviderApiCallReturnSuccess<CreateOrderResponse>> => {
      logger.info(`sending order request: ${JSON.stringify(request_body)}`);
      const { result, ...httpResponse } = await orders_api.createOrder(request_body);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(call_fxn);
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
              amount: BigIntMoneyToIntMoney(result.payment!.totalMoney!),
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

  SearchCatalogItems = async (searchRequest: Omit<SearchCatalogItemsRequest, 'limit'>) => {
    const catalogApi = this.#client.catalogApi;

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<SearchCatalogItemsResponse>> => {
      logger.info(`sending catalog item search: ${JSON.stringify(searchRequest)}`);
      const { result, ...httpResponse } = await catalogApi.searchCatalogItems(searchRequest);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  SearchCatalogObjects = async (searchRequest: Omit<SearchCatalogObjectsRequest, 'limit'>) => {
    const catalogApi = this.#client.catalogApi;

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<SearchCatalogObjectsResponse>> => {
      logger.info(`sending catalog search: ${JSON.stringify(searchRequest)}`);
      const { result, ...httpResponse } = await catalogApi.searchCatalogObjects(searchRequest);
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  ListCatalogObjects = async (types: string[], cursor?: string | undefined) => {
    const catalogApi = this.#client.catalogApi;

    const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<ListCatalogResponse>> => {
      logger.info(`sending catalog list request for types: ${types.join(', ')} with cursor: ${cursor}`);
      const { result, ...httpResponse } = await catalogApi.listCatalog(cursor, types.join(', '));
      return { success: true, result: result, error: [] };
    }
    return await SquareRequestHandler(callFxn);
  }

  BatchUpsertCatalogObjects = async (objectBatches: CatalogObjectBatch[]): Promise<SquareProviderApiCallReturnValue<BatchUpsertCatalogObjectsResponse>> => {
    const catalogApi = this.#client.catalogApi;

    let remainingObjects = objectBatches.slice();
    const responses: SquareProviderApiCallReturnSuccess<BatchUpsertCatalogObjectsResponse>[] = []
    do {
      const leftovers = remainingObjects.splice(Math.floor(this.#catalogLimits.batchUpsertMaxTotalObjects / SQUARE_BATCH_CHUNK_SIZE));
      const idempotency_key = crypto.randomBytes(22).toString('hex');
      const request_body: BatchUpsertCatalogObjectsRequest = {
        idempotencyKey: idempotency_key,
        batches: remainingObjects
      };

      const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<BatchUpsertCatalogObjectsResponse>> => {
        logger.info(`sending catalog upsert batch: ${JSON.stringify(request_body)}`);
        const { result, ...httpResponse } = await catalogApi.batchUpsertCatalogObjects(request_body);
        return { success: true, result: result, error: [] };
      }  
      const response = await SquareRequestHandler(callFxn);
      if (!response.success) {
        return response;
      }
      remainingObjects = leftovers;
      responses.push(response);
    } while (remainingObjects.length > 0);
    return { 
      error: responses.flatMap(x=>x.error), 
      result: {
        errors: responses.flatMap(x=>(x.result.errors ?? [])),
        idMappings: responses.flatMap(x=>(x.result.idMappings ?? [])),
        objects: responses.flatMap(x=>(x.result.objects ?? [])),
        updatedAt: responses[0].result.updatedAt, 
      }, 
      success: true 
    };
  }

  BatchDeleteCatalogObjects = async (objectIds: string[]): Promise<SquareProviderApiCallReturnValue<BatchDeleteCatalogObjectsResponse>> => {
    const catalogApi = this.#client.catalogApi;
    let remainingObjects = objectIds.slice();
    const responses: SquareProviderApiCallReturnSuccess<BatchDeleteCatalogObjectsResponse>[] = []
    do {
      const leftovers = remainingObjects.splice(this.#catalogLimits.batchDeleteMaxObjectIds);
      const request_body: BatchDeleteCatalogObjectsRequest = {
        objectIds: remainingObjects
      };

      const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<BatchDeleteCatalogObjectsResponse>> => {
        logger.info(`sending catalog delete batch: ${JSON.stringify(request_body)}`);
        const { result, ...httpResponse } = await catalogApi.batchDeleteCatalogObjects(request_body);
        return { success: true, result: result, error: [] };
      }
      const response = await SquareRequestHandler(callFxn);
      if (!response.success) {
        return response;
      }
      remainingObjects = leftovers;
      responses.push(response);
    } while (remainingObjects.length > 0);

    return { 
      error: responses.flatMap(x=>x.error), 
      result: { deletedAt: responses[0].result.deletedAt, 
        deletedObjectIds: responses.flatMap(x=>(x.result.deletedObjectIds ?? [])), 
        errors: responses.flatMap(x=>(x.result.errors ?? [])) 
      }, 
      success: true 
    };

  }

  BatchRetrieveCatalogObjects = async (objectIds: string[], includeRelated: boolean): Promise<SquareProviderApiCallReturnValue<BatchRetrieveCatalogObjectsResponse>> => {
    const catalogApi = this.#client.catalogApi;
    
    let remainingObjects = objectIds.slice();
    const responses: SquareProviderApiCallReturnSuccess<BatchRetrieveCatalogObjectsResponse>[] = []

    do {
      const leftovers = remainingObjects.splice(this.#catalogLimits.batchRetrieveMaxObjectIds);
      const request_body: BatchRetrieveCatalogObjectsRequest = {
        objectIds: remainingObjects,
        includeRelatedObjects: includeRelated
      };

      const callFxn = async (): Promise<SquareProviderApiCallReturnSuccess<BatchRetrieveCatalogObjectsResponse>> => {
        logger.info(`sending catalog retrieve batch: ${JSON.stringify(request_body)}`);
        const { result, ...httpResponse } = await catalogApi.batchRetrieveCatalogObjects(request_body);
        return { success: true, result: result, error: [] };
      }
      const response = await SquareRequestHandler(callFxn);
      if (!response.success) {
        return response;
      }
      remainingObjects = leftovers;
      responses.push(response);
    } while (remainingObjects.length > 0);

    return { 
      error: responses.flatMap(x=>x.error), 
      result: { objects: responses.flatMap(x=>(x.result.objects ?? [])), 
        relatedObjects: responses.flatMap(x=>(x.result.relatedObjects ?? [])), 
        errors: responses.flatMap(x=>(x.result.errors ?? [])) 
      }, 
      success: true 
    };
  }

  SendMessageOrder = async (order: Order) => {
    const sentOrder = await this.CreateOrder(order);
    if (sentOrder.success && sentOrder.result.order?.id) {
      const payment = await this.CreatePayment({
        amount: { currency: CURRENCY.USD, amount: 0 },
        autocomplete: true,
        locationId: order.locationId,
        referenceId: "",
        storeCreditPayment: {
          t: PaymentMethod.StoreCredit,
          amount: { currency: CURRENCY.USD, amount: 0 },
          createdAt: Date.now(),
          payment: {
            code: "FOO",
            lock: {
              auth: 'FOO',
              iv: 'FOO',
              enc: 'FOO',
            },
            processorId: 'FOO',
          },
          status: TenderBaseStatus.AUTHORIZED,
          tipAmount: { currency: CURRENCY.USD, amount: 0 }
        },
        squareOrderId: sentOrder.result.order.id,
        sourceId: "EXTERNAL"
      });
      if (payment.success) {
        return true;
      }
    }
    return false;
  }
};

export const SquareProviderInstance = new SquareProvider();