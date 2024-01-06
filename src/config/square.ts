import { Error as SquareError, Client, CreateOrderRequest, CreateOrderResponse, CreatePaymentRequest, Environment, UpdateOrderRequest, UpdateOrderResponse, PaymentRefund, RefundPaymentRequest, PayOrderRequest, PayOrderResponse, Payment, RetrieveOrderResponse, Order, UpsertCatalogObjectRequest, BatchUpsertCatalogObjectsRequest, CatalogObjectBatch, CatalogObject, BatchUpsertCatalogObjectsResponse, UpsertCatalogObjectResponse, BatchDeleteCatalogObjectsRequest, BatchDeleteCatalogObjectsResponse, BatchRetrieveCatalogObjectsRequest, BatchRetrieveCatalogObjectsResponse, CatalogInfoResponseLimits, SearchCatalogItemsRequest, SearchCatalogItemsResponse, SearchCatalogObjectsRequest, SearchCatalogObjectsResponse, ListCatalogResponse, SearchOrdersResponse, SearchOrdersRequest, SearchOrdersQuery, BatchRetrieveOrdersResponse, CreatePaymentResponse, RefundPaymentResponse, CancelPaymentResponse, CatalogInfoResponse } from 'square';
import { WProvider } from '../types/WProvider';
import crypto from 'crypto';
import logger from '../logging';
import { DataProviderInstance } from './dataprovider';
import { IMoney, PaymentMethod, CURRENCY, OrderPaymentAllocated } from '@wcp/wcpshared';
import { parseISO } from 'date-fns';
import { StoreCreditPayment } from '@wcp/wcpshared';
import { BigIntMoneyToIntMoney, IMoneyToBigIntMoney, MapPaymentStatus } from './SquareWarioBridge';
import { IS_PRODUCTION } from '../utils';
import { ApiResponse, RetryConfiguration } from 'square/dist/types/core';

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

const SQUARE_RETRY_CONFIG: RetryConfiguration = {
  maxNumberOfRetries: 5,
  retryOnTimeout: true,
  retryInterval: 1,
  maximumRetryWaitTime: 0,
  backoffFactor: 3,
  httpStatusCodesToRetry: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524],
  httpMethodsToRetry: ['GET', 'DELETE', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'LINK', 'UNLINK']
};

interface SquareResponseBase {
  errors?: SquareError[];
}

const SquareCallFxnWrapper = async<T extends SquareResponseBase>(apiRequestMaker: () => Promise<ApiResponse<T>>, retry = 0): Promise<SquareProviderApiCallReturnValue<T>> => {
  try {
    const { result, ...httpResponse } = await apiRequestMaker();
    if (SQUARE_RETRY_CONFIG.httpStatusCodesToRetry.includes(httpResponse.statusCode)) {
      if (retry < SQUARE_RETRY_CONFIG.maxNumberOfRetries) {
        const waittime = (2 ** (retry + 1) * 10) + 1000 * (Math.random());
        logger.warn(`Waiting ${waittime} on retry ${retry + 1} of ${SQUARE_RETRY_CONFIG.maxNumberOfRetries}`);
        await new Promise((res) => setTimeout(res, waittime));
        return await SquareCallFxnWrapper(apiRequestMaker, retry + 1);
      }
    }
    if (result.errors && result.errors.length > 0) {
      return { success: false, result: null, error: result.errors ?? [] }
    }
    return { success: true, result: result, error: [] };
  } catch (error) {
    const errorDetail = `Got unknown error: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`;
    logger.error(errorDetail);
    return { success: false, result: null, error: [{ category: "API_ERROR", code: "INTERNAL_SERVER_ERROR", detail: 'Internal Server Error. Please reach out for assistance.' }] };
  }
}


export class SquareProvider implements WProvider {
  #client: Client;
  #catalogLimits: Required<CatalogInfoResponseLimits>;
  #catalogIdsToDelete: string[];
  #obliterateModifiersOnLoad: boolean;
  constructor() {
    this.#catalogLimits = DEFAULT_LIMITS;
    this.#catalogIdsToDelete = [];
    this.#obliterateModifiersOnLoad = false;
  }

  set CatalogIdsToDeleteOnLoad(value: string[]) {
    this.#catalogIdsToDelete = value.slice();
  }

  set ObliterateModifiersOnLoad(value: boolean) {
    this.#obliterateModifiersOnLoad = value;
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

    if (this.#catalogIdsToDelete.length > 0) {
      logger.info('Migration requested square catalog object deletion.')
      await this.BatchDeleteCatalogObjects(this.#catalogIdsToDelete);
      this.#catalogIdsToDelete = [];
    }

    if (this.#obliterateModifiersOnLoad === true) {
      logger.info('Obliterating modifiers for this location on load');
      await this.ObliterateModifiersInSquareCatalog();
    }

    logger.info(`Finished Bootstrap of SquareProvider`);
  }


  private ObliterateItemsInSquareCatalog = async () => {
    // get all items in the Slices category and delete them
    const foundItems: string[] = [];
    let cursor: string | undefined;
    let response;
    do {
      response = await this.SearchCatalogItems({
        enabledLocationIds: [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION],
        // categoryIds: ['PKUWESSO3UPXCJHSITZMMHAM'],
        // categoryIds: ['N5QMDVHPD5QAR4V35BVBC2CL'] // sandbox
        ...(cursor ? { cursor } : {})
      });
      if (!response.success) {
        return;
      }
      foundItems.push(...(response.result.items ?? []).map(x => x.id));
      // foundItems.push(...(response.result.items ?? []).filter(x => !x.itemData?.categoryId).map(x => x.id));
      cursor = response.result.cursor ?? undefined;
    }
    while (cursor);
    logger.info(`Deleting the following items: ${foundItems.join(", ")}`);
    await this.BatchDeleteCatalogObjects(foundItems);
  }

  private ObliterateModifiersInSquareCatalog = async () => {
    const foundItems: string[] = [];
    let cursor: string | undefined;
    let response;
    do {
      response = await this.ListCatalogObjects(['MODIFIER_LIST'], cursor);
      if (!response.success) {
        return;
      }
      foundItems.push(...(response.result.objects ?? []).filter(x => x.presentAtLocationIds?.includes(DataProviderInstance.KeyValueConfig.SQUARE_LOCATION)).map(x => x.id));
      cursor = response.result.cursor ?? undefined;
    }
    while (cursor);
    logger.info(`Deleting the following object Modifier List IDs: ${foundItems.join(", ")}`);
    await this.BatchDeleteCatalogObjects(foundItems);
  }

  private ObliterateCategoriesInSquareCatalog = async () => {
    const foundItems: string[] = [];
    let cursor: string | undefined;
    let response;
    do {
      response = await this.ListCatalogObjects(['CATEGORY'], cursor);
      if (!response.success) {
        return;
      }
      foundItems.push(...(response.result.objects ?? []).map(x => x.id));
      cursor = response.result.cursor ?? undefined;
    }
    while (cursor);
    logger.info(`Deleting the following Category object IDs: ${foundItems.join(", ")}`);
    await this.BatchDeleteCatalogObjects(foundItems);
  }

  GetCatalogInfo = async (): Promise<SquareProviderApiCallReturnValue<CatalogInfoResponseLimits>> => {
    const api = this.#client.catalogApi;
    const call_fxn = async (): Promise<ApiResponse<CatalogInfoResponse>> => {
      logger.info('sending Catalog Info request to Square API');
      return await api.catalogInfo();
    }
    const response = await SquareCallFxnWrapper(call_fxn);
    if (response.success && response.result.limits) {
      return { success: true, result: response.result.limits, error: [] };
    }
    return {
      success: false,
      result: null,
      error: response.error ?? []
    };
  }

  CreateOrder = async (order: Order): Promise<SquareProviderApiCallReturnValue<CreateOrderResponse>> => {
    // TODO: use idempotency key from order instead
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: CreateOrderRequest = {
      idempotencyKey: idempotency_key,
      order: order
    };
    const call_fxn = async (): Promise<ApiResponse<CreateOrderResponse>> => {
      logger.info(`sending order request: ${JSON.stringify(request_body)}`);
      return await orders_api.createOrder(request_body);
    }
    return await SquareCallFxnWrapper(call_fxn);
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

    const callFxn = async (): Promise<ApiResponse<UpdateOrderResponse>> => {
      logger.info(`sending order update request for order ${orderId}: ${JSON.stringify(request_body)}`);
      return await orders_api.updateOrder(orderId, request_body);
    }
    return await SquareCallFxnWrapper(callFxn);
  }

  OrderStateChange = async (locationId: string, orderId: string, version: number, new_state: string) => {
    return this.OrderUpdate(locationId, orderId, version, { state: new_state }, []);
  }

  RetrieveOrder = async (squareOrderId: string) => {
    const orders_api = this.#client.ordersApi;
    const callFxn = async (): Promise<ApiResponse<RetrieveOrderResponse>> => {
      logger.info(`Getting Square Order with ID: ${squareOrderId}`);
      return await orders_api.retrieveOrder(squareOrderId);
    }
    return await SquareCallFxnWrapper(callFxn);
  }


  BatchRetrieveOrders = async (locationId: string, orderIds: string[]) => {
    const orders_api = this.#client.ordersApi;
    const callFxn = async (): Promise<ApiResponse<BatchRetrieveOrdersResponse>> => {
      logger.debug(`Getting Square Orders: ${orderIds.join(", ")}`);
      return await orders_api.batchRetrieveOrders({ orderIds, locationId });
    }
    return await SquareCallFxnWrapper(callFxn);
  }

  SearchOrders = async (locationIds: string[], query: SearchOrdersQuery) => {
    const orders_api = this.#client.ordersApi;
    const request_body: SearchOrdersRequest = {
      query,
      locationIds
    };
    const callFxn = async (): Promise<ApiResponse<SearchOrdersResponse>> => {
      logger.debug(`Searching Square Orders with: ${JSON.stringify(request_body)}`);
      return await orders_api.searchOrders(request_body);
    }
    return await SquareCallFxnWrapper(callFxn);
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
  }: SquareProviderCreatePaymentRequest): Promise<SquareProviderApiCallReturnValue<OrderPaymentAllocated>> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const payments_api = this.#client.paymentsApi;
    const tipMoney = tipAmount ?? { currency: CURRENCY.USD, amount: 0 };
    const request_body: CreatePaymentRequest = {
      sourceId: storeCreditPayment ? "EXTERNAL" : sourceId,
      externalDetails: storeCreditPayment ? { type: 'STORED_BALANCE', source: "WARIO", sourceId: storeCreditPayment.payment.code } : undefined,
      ...(sourceId === 'CASH' ? { cashDetails: { buyerSuppliedMoney: IMoneyToBigIntMoney(amount), changeBackMoney: { amount: 0n, currency: amount.currency } } } : {}),
      amountMoney: IMoneyToBigIntMoney({ currency: amount.currency, amount: amount.amount - tipMoney.amount }),
      tipMoney: IMoneyToBigIntMoney(tipMoney),
      referenceId: storeCreditPayment ? storeCreditPayment.payment.code : referenceId,
      orderId: squareOrderId,
      locationId,
      autocomplete,
      acceptPartialAuthorization: false,
      verificationToken,
      idempotencyKey: idempotency_key
    };

    const callFxn = async (): Promise<ApiResponse<CreatePaymentResponse>> => {
      logger.info(`sending payment request: ${JSON.stringify(request_body)}`);
      return await payments_api.createPayment(request_body);
    }
    const response = await SquareCallFxnWrapper(callFxn);
    if (response.success && response.result.payment && response.result.payment.status) {
      const paymentStatus = MapPaymentStatus(response.result.payment.status);
      const createdAt = parseISO(response.result.payment.createdAt!).valueOf();
      const processorId = response.result.payment.id!;
      return {
        success: true,
        result: storeCreditPayment ? {
          ...storeCreditPayment,
          status: paymentStatus,
          processorId,
          payment: {
            ...storeCreditPayment.payment,
          }
        } :
          (response.result.payment.sourceType === 'CASH' ? {
            t: PaymentMethod.Cash,
            createdAt,
            processorId,
            amount: BigIntMoneyToIntMoney(response.result.payment.totalMoney!),
            tipAmount: tipMoney,
            status: paymentStatus,
            payment: {
              amountTendered: BigIntMoneyToIntMoney(response.result.payment.cashDetails!.buyerSuppliedMoney),
              change: response.result.payment.cashDetails!.changeBackMoney ? BigIntMoneyToIntMoney(response.result.payment.cashDetails!.changeBackMoney) : { currency: amount.currency, amount: 0 },
            },
          } : {
            t: PaymentMethod.CreditCard,
            createdAt,
            processorId,
            amount: BigIntMoneyToIntMoney(response.result.payment!.totalMoney!),
            tipAmount: tipMoney,
            status: paymentStatus,
            payment: {
              processor: 'SQUARE',
              billingZip: response.result.payment.billingAddress?.postalCode ?? undefined,
              cardBrand: response.result.payment.cardDetails?.card?.cardBrand ?? undefined,
              expYear: response.result.payment.cardDetails?.card?.expYear?.toString(),
              last4: response.result.payment.cardDetails?.card?.last4 ?? "",
              receiptUrl: response.result.payment.receiptUrl ?? `https://squareup.com/receipt/preview/${response.result.payment.id}`,
              cardholderName: response.result.payment.cardDetails?.card?.cardholderName ?? undefined,
            }
          }),
        error: []
      };
    }
    return {
      success: false,
      result: null,
      error: response.error
    };
  }

  ProcessPayment = async ({ locationId, sourceId, amount, referenceId, squareOrderId, verificationToken }: SquareProviderProcessPaymentRequest) => {
    return await this.CreatePayment({ locationId, sourceId, amount, referenceId, squareOrderId, verificationToken, autocomplete: true });
  }

  PayOrder = async (square_order_id: string, paymentIds: string[]): Promise<SquareProviderApiCallReturnValue<PayOrderResponse>> => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const orders_api = this.#client.ordersApi;
    const request_body: PayOrderRequest = {
      idempotencyKey: idempotency_key,
      paymentIds
    };

    const callFxn = async (): Promise<ApiResponse<PayOrderResponse>> => {
      logger.info(`sending order payment request ${square_order_id}: ${JSON.stringify(request_body)}`);
      return await orders_api.payOrder(square_order_id, request_body);
    }
    return await SquareCallFxnWrapper(callFxn);
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

    const callFxn = async (): Promise<ApiResponse<RefundPaymentResponse>> => {
      logger.info(`sending payment REFUND request: ${JSON.stringify(request_body)}`);
      return await refundsApi.refundPayment(request_body);
    }
    const response = await SquareCallFxnWrapper(callFxn);
    if (response.success && response.result.refund && response.result.refund.status !== 'REJECTED' && response.result.refund.status !== 'FAILED') {
      return {
        success: true,
        result: response.result.refund,
        error: []
      };
    }
    return {
      success: false,
      result: null,
      error: response.error ?? []
    };
  }

  CancelPayment = async (squarePaymentId: string): Promise<SquareProviderApiCallReturnValue<Payment>> => {
    const paymentsApi = this.#client.paymentsApi;
    const callFxn = async (): Promise<ApiResponse<CancelPaymentResponse>> => {
      logger.info(`sending payment CANCEL request for: ${squarePaymentId}`);
      return await paymentsApi.cancelPayment(squarePaymentId);
    }
    const response = await SquareCallFxnWrapper(callFxn);
    if (response.success && response.result.payment && response.result.payment.status === 'CANCELED') {
      return {
        success: true,
        result: response.result.payment,
        error: []
      };
    }
    return {
      success: false,
      result: null,
      error: response.error ?? []
    };
  }

  UpsertCatalogObject = async (object: CatalogObject) => {
    const idempotency_key = crypto.randomBytes(22).toString('hex');
    const catalogApi = this.#client.catalogApi;
    const request_body: UpsertCatalogObjectRequest = {
      idempotencyKey: idempotency_key,
      object
    };

    const callFxn = async (): Promise<ApiResponse<UpsertCatalogObjectResponse>> => {
      logger.info(`sending catalog upsert: ${JSON.stringify(request_body)}`);
      return await catalogApi.upsertCatalogObject(request_body);
    }
    return await SquareCallFxnWrapper(callFxn);
  }

  SearchCatalogItems = async (searchRequest: Omit<SearchCatalogItemsRequest, 'limit'>) => {
    const catalogApi = this.#client.catalogApi;

    const callFxn = async (): Promise<ApiResponse<SearchCatalogItemsResponse>> => {
      logger.info(`sending catalog item search: ${JSON.stringify(searchRequest)}`);
      return await catalogApi.searchCatalogItems(searchRequest);
    }
    return await SquareCallFxnWrapper(callFxn);
  }

  SearchCatalogObjects = async (searchRequest: Omit<SearchCatalogObjectsRequest, 'limit'>) => {
    const catalogApi = this.#client.catalogApi;

    const callFxn = async (): Promise<ApiResponse<SearchCatalogObjectsResponse>> => {
      logger.info(`sending catalog search: ${JSON.stringify(searchRequest)}`);
      return await catalogApi.searchCatalogObjects(searchRequest);
    }
    return await SquareCallFxnWrapper(callFxn);
  }

  ListCatalogObjects = async (types: string[], cursor?: string | undefined) => {
    const catalogApi = this.#client.catalogApi;

    const callFxn = async (): Promise<ApiResponse<ListCatalogResponse>> => {
      logger.info(`sending catalog list request for types: ${types.join(', ')} with cursor: ${cursor}`);
      return await catalogApi.listCatalog(cursor, types.join(', '));
    }
    return await SquareCallFxnWrapper(callFxn);
  }

  BatchUpsertCatalogObjects = async (objectBatches: CatalogObjectBatch[]): Promise<SquareProviderApiCallReturnValue<BatchUpsertCatalogObjectsResponse>> => {
    const catalogApi = this.#client.catalogApi;

    let remainingObjects = objectBatches.slice();
    const responses: SquareProviderApiCallReturnSuccess<BatchUpsertCatalogObjectsResponse>[] = []
    do {
      const leftovers = remainingObjects.splice(Math.floor(this.#catalogLimits.batchUpsertMaxTotalObjects! / SQUARE_BATCH_CHUNK_SIZE));
      const idempotency_key = crypto.randomBytes(22).toString('hex');
      const request_body: BatchUpsertCatalogObjectsRequest = {
        idempotencyKey: idempotency_key,
        batches: remainingObjects
      };

      const callFxn = async (): Promise<ApiResponse<BatchUpsertCatalogObjectsResponse>> => {
        logger.info(`sending catalog upsert batch: ${JSON.stringify(request_body)}`);
        return await catalogApi.batchUpsertCatalogObjects(request_body);
      }
      const response = await SquareCallFxnWrapper(callFxn);
      if (!response.success) {
        return response;
      }
      remainingObjects = leftovers;
      responses.push(response);
    } while (remainingObjects.length > 0);
    return {
      error: responses.flatMap(x => x.error),
      result: {
        errors: responses.flatMap(x => (x.result.errors ?? [])),
        idMappings: responses.flatMap(x => (x.result.idMappings ?? [])),
        objects: responses.flatMap(x => (x.result.objects ?? [])),
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
      const leftovers = remainingObjects.splice(this.#catalogLimits.batchDeleteMaxObjectIds!);
      const request_body: BatchDeleteCatalogObjectsRequest = {
        objectIds: remainingObjects
      };

      const callFxn = async (): Promise<ApiResponse<BatchDeleteCatalogObjectsResponse>> => {
        logger.info(`sending catalog delete batch: ${JSON.stringify(request_body)}`);
        return await catalogApi.batchDeleteCatalogObjects(request_body);
      }
      const response = await SquareCallFxnWrapper(callFxn);
      if (!response.success) {
        return response;
      }
      remainingObjects = leftovers;
      responses.push(response);
    } while (remainingObjects.length > 0);

    return {
      error: responses.flatMap(x => x.error),
      result: {
        deletedAt: responses[0].result.deletedAt,
        deletedObjectIds: responses.flatMap(x => (x.result.deletedObjectIds ?? [])),
        errors: responses.flatMap(x => (x.result.errors ?? []))
      },
      success: true
    };

  }

  BatchRetrieveCatalogObjects = async (objectIds: string[], includeRelated: boolean): Promise<SquareProviderApiCallReturnValue<BatchRetrieveCatalogObjectsResponse>> => {
    const catalogApi = this.#client.catalogApi;

    let remainingObjects = objectIds.slice();
    const responses: SquareProviderApiCallReturnSuccess<BatchRetrieveCatalogObjectsResponse>[] = []

    do {
      const leftovers = remainingObjects.splice(this.#catalogLimits.batchRetrieveMaxObjectIds!);
      const request_body: BatchRetrieveCatalogObjectsRequest = {
        objectIds: remainingObjects,
        includeRelatedObjects: includeRelated
      };

      const callFxn = async (): Promise<ApiResponse<BatchRetrieveCatalogObjectsResponse>> => {
        logger.info(`sending catalog retrieve batch: ${JSON.stringify(request_body)}`);
        return await catalogApi.batchRetrieveCatalogObjects(request_body);
      }
      const response = await SquareCallFxnWrapper(callFxn);
      if (!response.success) {
        return response;
      }
      remainingObjects = leftovers;
      responses.push(response);
    } while (remainingObjects.length > 0);

    return {
      error: responses.flatMap(x => x.error),
      result: {
        objects: responses.flatMap(x => (x.result.objects ?? [])),
        relatedObjects: responses.flatMap(x => (x.result.relatedObjects ?? [])),
        errors: responses.flatMap(x => (x.result.errors ?? []))
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
        squareOrderId: sentOrder.result.order.id,
        sourceId: "CASH"
      });
      if (payment.success) {
        return sentOrder.result;
      }
    }
    return false;
  }
};

export const SquareProviderInstance = new SquareProvider();