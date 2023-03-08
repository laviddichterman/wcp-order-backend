import {
  CanThisBeOrderedAtThisTimeAndFulfillment,
  CategorizedRebuiltCart,
  WProduct,
  WCPProductV2Dto,
  CreateOrderRequestV2,
  FulfillmentDto,
  DeliveryInfoDto,
  CoreCartEntry,
  CrudOrderResponse,
  WDateUtils,
  GenerateMenu,
  IMenu,
  FulfillmentConfig,
  OrderPayment,
  WOrderInstancePartial,
  ValidateLockAndSpendSuccess,
  OrderLineDiscount,
  CURRENCY,
  DiscountMethod,
  PaymentMethod,
  DineInInfoDto,
  WOrderInstance,
  TenderBaseStatus,
  WError,
  MoneyToDisplayString,
  DateTimeIntervalBuilder,
  WOrderStatus,
  FulfillmentTime,
  FulfillmentType,
  RebuildAndSortCart,
  ResponseWithStatusCode,
  ResponseSuccess,
  WFulfillmentStatus,
  CustomerInfoDto,
  EventTitleStringBuilder,
  GenerateDineInPlusString,
  RecomputeTotalsResult,
  OrderPaymentAllocated,
  RecomputeTotals,
  OrderPaymentProposed,
  DetermineCartBasedLeadTime
} from "@wcp/wcpshared";

import { WProvider } from '../types/WProvider';

import { formatRFC3339, format, Interval, isSameMinute, formatISO, addHours, isSameDay, subMinutes, setSeconds, setMilliseconds, isBefore, subDays } from 'date-fns';
import { GoogleProviderInstance } from "./google";
import { SquareProviderInstance } from "./square";
import { StoreCreditProviderInstance } from "./store_credit_provider";
import { CatalogProviderInstance } from './catalog_provider';
import { DataProviderInstance } from './dataprovider';
import logger from '../logging';
import crypto from 'crypto';
import { OrderFunctional } from "@wcp/wcpshared";
import { WOrderInstanceModel } from "../models/orders/WOrderInstance";
import { Order as SquareOrder } from "square";
import { SocketIoProviderInstance } from "./socketio_provider";
import { CreateOrderFromCart, CreateOrderForMessages, CreateOrdersForPrintingFromCart, CartByPrinterGroup, GetSquareIdFromExternalIds, BigIntMoneyToIntMoney, LineItemsToOrderInstanceCart } from "./SquareWarioBridge";
import { FilterQuery } from "mongoose";
import { WOrderInstanceFunctionModel } from "../models/query/order/WOrderInstanceFunction";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { calendar_v3 } from "googleapis";
type CrudFunctionResponseWithStatusCode = (order: WOrderInstance) => ResponseWithStatusCode<CrudOrderResponse>;
const WCP = "Windy City Pie";

const IL_AREA_CODES = ["217", "309", "312", "630", "331", "618", "708", "773", "815", "779", "847", "224", "872"];
const MI_AREA_CODES = ["231", "248", "269", "313", "517", "586", "616", "734", "810", "906", "947", "989", "679"];

const BTP_AREA_CODES = IL_AREA_CODES.concat(MI_AREA_CODES);
const WCP_AREA_CODES = IL_AREA_CODES;

const IsNativeAreaCode = function (phone: string, area_codes: string[]) {
  const numeric_phone = phone.match(/\d/g)!.join("");
  const area_code = numeric_phone.slice(0, 3);
  return (numeric_phone.length == 10 && area_codes.some(x => x === area_code));
};

const DateTimeIntervalToDisplayServiceInterval = (interval: Interval) => {
  return isSameMinute(interval.start, interval.end) ? format(interval.start, WDateUtils.DisplayTimeFormat) : `${format(interval.start, WDateUtils.DisplayTimeFormat)} - ${format(interval.end, WDateUtils.DisplayTimeFormat)}`;
}

const CreateExternalConfirmationEmail = async function (order: WOrderInstance) {
  const NOTE_PREPAID = "You've already paid, so unless there's an issue with the order or you need to add something, there's no need to handle payment from this point forward.";
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const STORE_ADDRESS = DataProviderInstance.KeyValueConfig.STORE_ADDRESS;
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;

  const fulfillmentConfig = DataProviderInstance.Fulfillments[order.fulfillment.selectedService];
  const dateTimeInterval = DateTimeIntervalBuilder(order.fulfillment, fulfillmentConfig);
  const display_time = DateTimeIntervalToDisplayServiceInterval(dateTimeInterval);
  const customer_name = [order.customerInfo.givenName, order.customerInfo.familyName].join(" ");
  const service_title = ServiceTitleBuilder(fulfillmentConfig.displayName, order.fulfillment, customer_name, dateTimeInterval);
  const nice_area_code = IsNativeAreaCode(order.customerInfo.mobileNum, STORE_NAME === WCP ? WCP_AREA_CODES : BTP_AREA_CODES);
  const payment_section = (fulfillmentConfig.service === FulfillmentType.DineIn ? NOTE_PREPAID : NOTE_PREPAID);
  const confirm = fulfillmentConfig.messages.CONFIRMATION; // [`We're happy to confirm your ${display_time} pickup at`, `We're happy to confirm your ${display_time} at`, `We're happy to confirm your delivery around ${display_time} at`];
  const where = order.fulfillment.deliveryInfo?.validation?.validated_address ?? STORE_ADDRESS;

  return await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    order.customerInfo.email,
    service_title,
    EMAIL_ADDRESS,
    `<p>${nice_area_code ? "Hey, nice area code!" : "Thanks!"}<br />${confirm} ${display_time} order at ${where}.</p>${fulfillmentConfig.messages.INSTRUCTIONS} ${payment_section}`);
}

const CreateExternalCancelationEmail = async function (
  order: WOrderInstance,
  message: string
) {
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;

  const fulfillmentConfig = DataProviderInstance.Fulfillments[order.fulfillment.selectedService];
  const dateTimeInterval = DateTimeIntervalBuilder(order.fulfillment, fulfillmentConfig);
  const display_time = DateTimeIntervalToDisplayServiceInterval(dateTimeInterval);
  const customer_name = [order.customerInfo.givenName, order.customerInfo.familyName].join(" ");
  const service_title = ServiceTitleBuilder(fulfillmentConfig.displayName, order.fulfillment, customer_name, dateTimeInterval);


  return await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    order.customerInfo.email,
    service_title,
    EMAIL_ADDRESS,
    `${message ? `<p>${message}</p>` : ""}<br />${customer_name},<br />This message serves to inform you that we've canceled your order previously scheduled for ${display_time}. We hope to see you again in the near future!`);
}

function GenerateOrderPaymentDisplay(payment: OrderPayment, isHtml: boolean) {
  const lineBreak = isHtml ? "<br />" : "\n";
  switch (payment.t) {
    case PaymentMethod.Cash:
      return `Received cash payment of ${MoneyToDisplayString(payment.amount, true)}.${lineBreak}`;
    case PaymentMethod.CreditCard:
      if (payment.status === TenderBaseStatus.PROPOSED) {
        return `Received payment of ${MoneyToDisplayString(payment.amount, true)} from credit card`;
      } else {
        return `Received payment of ${MoneyToDisplayString(payment.amount, true)} from credit card ending in ${payment.payment.last4}.
        ${lineBreak}
        ${payment.payment.receiptUrl ?
            (isHtml ?
              `<a href="${payment.payment.receiptUrl}">Receipt link</a>${lineBreak}` :
              `Receipt: ${payment.payment.receiptUrl}${lineBreak}`) :
            ""}`;
      }
    case PaymentMethod.StoreCredit:
      return `Applied store credit value ${MoneyToDisplayString(payment.amount, true)} using code ${payment.payment.code}.${lineBreak}`;
  }
}

function GenerateOrderLineDiscountDisplay(discount: OrderLineDiscount, isHtml: boolean) {
  switch (discount.t) {
    case DiscountMethod.CreditCodeAmount:
      return `Applied discount of ${MoneyToDisplayString(discount.discount.amount, true)}, pre-tax. Credit code used: ${discount.discount.code}.${isHtml ? "<br />" : "\n"}`;
    case DiscountMethod.ManualAmount:
      return `Applied discount of ${MoneyToDisplayString(discount.discount.amount, true)}, pre-tax.`;
    case DiscountMethod.ManualPercentage:
      return `Applied ${(discount.discount.percentage * 100).toFixed(2)}% discount, valuing ${MoneyToDisplayString(discount.discount.amount, true)}.`
  }
}

const GeneratePaymentSection = (totals: RecomputeTotalsResult, discounts: OrderLineDiscount[], payments: OrderPayment[], isHtml: boolean) => {
  const tip_amount = MoneyToDisplayString(totals.tipAmount, true);
  const subtotal = MoneyToDisplayString(totals.subtotalAfterDiscount, true);
  const totalAfterTaxBeforeTip = MoneyToDisplayString({ currency: CURRENCY.USD, amount: totals.subtotalAfterDiscount.amount + totals.taxAmount.amount }, true);
  const total_amount = MoneyToDisplayString(totals.total, true);
  const paymentDisplays = payments.map(payment => GenerateOrderPaymentDisplay(payment, isHtml)).join(isHtml ? "<br />" : "\n");
  const discountDisplays = discounts.map(discount => GenerateOrderLineDiscountDisplay(discount, isHtml)).join(isHtml ? "<br />" : "\n");
  return isHtml ? `${discountDisplays}
  <p>Pre-tax Amount: <strong>${subtotal}</strong><br />
  Post-tax Amount: <strong>${totalAfterTaxBeforeTip}</strong>&nbsp;(verify this with payment)<br />
  Tip Amount: <strong>${tip_amount}</strong><br /></p>
  <p>Received payment of: <strong>${total_amount}</strong></p>
  ${paymentDisplays}` :
    `${discountDisplays}
  Pre-tax Amount: ${subtotal}
  Post-tax Amount: ${totalAfterTaxBeforeTip}
  Tip Amount: ${tip_amount}
  Received payment of: ${total_amount}
  ${paymentDisplays}`;
}

const GenerateDeliverySection = (deliveryInfo: DeliveryInfoDto, ishtml: boolean) => {
  if (!deliveryInfo.validation || !deliveryInfo.validation.validated_address) {
    return "";
  }
  const delivery_unit_info = deliveryInfo.address2 ? `, Unit info: ${deliveryInfo.address2}` : "";
  const delivery_instructions = deliveryInfo.deliveryInstructions ? `${ishtml ? "<br />" : "\n"}Delivery Instructions: ${deliveryInfo.deliveryInstructions}` : "";
  return `${ishtml ? "<p><strong>" : "\n"}Delivery Address:${ishtml ? "</strong>" : ""} ${deliveryInfo.validation.validated_address}${delivery_unit_info}${delivery_instructions}${ishtml ? "</p>" : ""}`;
}

const GenerateDineInSection = (dineInInfo: DineInInfoDto, ishtml: boolean) => {
  return ishtml ? `<strong>Party size:</strong> ${dineInInfo.partySize}<br \>` : `Party size: ${dineInInfo.partySize}\n`;
}

const ServiceTitleBuilder = (service_option_display_string: string, fulfillmentInfo: FulfillmentDto, customer_name: string, service_time_interval: Interval) => {
  const display_service_time_interval = DateTimeIntervalToDisplayServiceInterval(service_time_interval);
  return `${service_option_display_string} for ${customer_name}${fulfillmentInfo.dineInInfo ? GenerateDineInPlusString(fulfillmentInfo.dineInInfo) : ''} on ${format(service_time_interval.start, WDateUtils.ServiceDateDisplayFormat)} at ${display_service_time_interval}`;
}

const GenerateDisplayCartStringListFromProducts = (cart: CategorizedRebuiltCart) =>
  Object.values(cart).map((category_cart) => category_cart.map((item) => `${item.quantity}x: ${item.product.m.name}`)).flat(1);


const GenerateCartTextFromFullCart = (cart: CategorizedRebuiltCart): { category_name: string; products: string[] }[] => {
  const catalogCategories = CatalogProviderInstance.Catalog.categories;
  return Object.entries(cart)
    .filter(([_, cart]) => cart.length > 0)
    .map(([catid, category_cart]) => {
      const category_name = catalogCategories[catid].category.name;
      const category_shortcart = { category_name: category_name, products: category_cart.map(x => `${x.quantity}x: ${x.product.m.name}`) };
      return category_shortcart;
    })
}

const RebuildOrderState = function (menu: IMenu, cart: CoreCartEntry<WCPProductV2Dto>[], service_time: Date | number, fulfillmentId: string) {
  const catalogSelectors = CatalogProviderInstance.CatalogSelectors;
  const rebuiltCart = RebuildAndSortCart(cart, catalogSelectors, service_time, fulfillmentId);
  const noLongerAvailable: CoreCartEntry<WProduct>[] = Object.values(rebuiltCart).flatMap(entries => entries.filter(x => !CanThisBeOrderedAtThisTimeAndFulfillment(x.product.p, menu, catalogSelectors, service_time, fulfillmentId, true) ||
    !catalogSelectors.category(x.categoryId)))
  return {
    noLongerAvailable,
    rebuiltCart
  };
}

const CreateExternalEmail = async (
  order: WOrderInstance,
  service_title: string,
  cart: CategorizedRebuiltCart) => {
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const ORDER_RESPONSE_PREAMBLE = DataProviderInstance.KeyValueConfig.ORDER_RESPONSE_PREAMBLE;
  const LOCATION_INFO = DataProviderInstance.KeyValueConfig.LOCATION_INFO;
  const delivery_section = order.fulfillment.deliveryInfo ? GenerateDeliverySection(order.fulfillment.deliveryInfo, true) : "";
  const sections = [
    ...GenerateDisplayCartStringListFromProducts(cart),
    ...(order.specialInstructions && order.specialInstructions.length > 0 ? [`<p><strong>Special Instructions</strong>: ${order.specialInstructions} </p>`] : []),
    ...(delivery_section ? [delivery_section] : []),
    ...order.discounts.map(discount => GenerateOrderLineDiscountDisplay(discount, true)),
    ...order.payments.map(payment => GenerateOrderPaymentDisplay(payment, true)),
    ...(delivery_section ? [] : [`<p><strong>Location Information:</strong> We are located ${LOCATION_INFO}</p>`])
  ];
  const emailbody = `<p>${ORDER_RESPONSE_PREAMBLE}</p>
<p>Please take some time to ensure the details of your order as they were entered are correct. If the order is fine, there is no need to respond to this message. If you need to make a correction or have a question, please respond to this message as soon as possible.</p>
    
<b>Order information:</b><br />
Service: ${service_title}.<br />
Phone: ${order.customerInfo.mobileNum}<br />
Order contents:<br />
${sections.join("<br />")}
<br />We thank you for your support!`;
  return await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    order.customerInfo.email,
    service_title,
    EMAIL_ADDRESS,
    emailbody);
}

const CreateExternalEmailForOrderReschedule = async (
  fulfillmentConfig: FulfillmentConfig,
  fulfillmentDto: FulfillmentDto,
  customerInfo: Pick<CustomerInfoDto, "email" | 'familyName' | 'givenName'>,
  additionalMessage: string
) => {
  const dateTimeInterval = DateTimeIntervalBuilder(fulfillmentDto, fulfillmentConfig);
  const service_title = ServiceTitleBuilder(fulfillmentConfig.displayName, fulfillmentDto, `${customerInfo.givenName} ${customerInfo.familyName}`, dateTimeInterval);
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const newTimeString = DateTimeIntervalToDisplayServiceInterval(dateTimeInterval);
  const emailbody = `<p>${customerInfo.givenName},</p> 
  We're letting you know that we've updated your order time.<br />
  The new time is ${newTimeString}.<br />
  ${additionalMessage ? `<p>${additionalMessage}</p>` : ""}
  If you have any questions, please feel free to reach out to us by responding to this email${DataProviderInstance.Settings.config.LOCATION_PHONE_NUMBER ? ` or via text message at ${DataProviderInstance.Settings.config.LOCATION_PHONE_NUMBER}` : ""}.`;
  return await GoogleProviderInstance.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    customerInfo.email,
    service_title,
    EMAIL_ADDRESS,
    emailbody);
}

const GenerateOrderEventJson = (
  shorthandEventTitle: string,
  order: Pick<WOrderInstance, 'customerInfo' | 'fulfillment' | 'payments' | 'discounts' | 'specialInstructions'>,
  cart: CategorizedRebuiltCart,
  service_time_interval: Interval,
  totals: RecomputeTotalsResult): calendar_v3.Schema$Event => {
  const shortcart = GenerateCartTextFromFullCart(cart);
  const special_instructions_section = order.specialInstructions && order.specialInstructions.length > 0 ? `\nSpecial Instructions: ${order.specialInstructions}` : "";
  const payment_section = "\n" + GeneratePaymentSection(totals, order.discounts, order.payments, false);
  const delivery_section = order.fulfillment.deliveryInfo ? GenerateDeliverySection(order.fulfillment.deliveryInfo, false) : "";
  const dineInSection = order.fulfillment.dineInInfo ? GenerateDineInSection(order.fulfillment.dineInInfo, false) : "";
  const calendar_details =
    `${shortcart.map((x) => `${x.category_name}:\n${x.products.join("\n")}`).join("\n")}
${dineInSection}
ph: ${order.customerInfo.mobileNum}
${special_instructions_section}${delivery_section}${payment_section}`;

  return {
    summary: shorthandEventTitle,
    location: order.fulfillment.deliveryInfo?.validation?.validated_address ?? "",
    description: calendar_details,
    start: {
      dateTime: formatRFC3339(service_time_interval.start),
      timeZone: process.env.TZ
    },
    end: {
      dateTime: formatRFC3339(service_time_interval.end),
      timeZone: process.env.TZ
    }
  };
}

async function RefundStoreCreditDebits(spends: ValidateLockAndSpendSuccess[]) {
  return Promise.all(spends.map(async (x) => {
    logger.info(`Refunding ${JSON.stringify(x.entry)} after failed processing.`);
    return StoreCreditProviderInstance.CheckAndRefundStoreCredit(x.entry, x.index);
  }))
}

async function RefundSquarePayments(payments: OrderPayment[], reason: string) {
  return Promise.all(payments
    .flatMap(x => x.status === TenderBaseStatus.COMPLETED ? [SquareProviderInstance.RefundPayment(x.processorId, x.amount, reason)] : []));
}

async function CancelSquarePayments(payments: OrderPaymentAllocated[]) {
  return Promise.all(payments
    .flatMap(x => x.status === TenderBaseStatus.AUTHORIZED ? [SquareProviderInstance.CancelPayment(x.processorId)] : []));
}

const GetEndOfSendingRange = (now: Date | number): Date => {
  return addHours(now, 3);
}

const Map3pSource = (source: string) => {
  if (source.startsWith("Postmates") || source.startsWith("Uber")) {
    return "UE";
  }
  return "DD";
}

export class OrderManager implements WProvider {
  constructor() {
  }

  private ClearPastOrders = async () => {
    try {
      logger.info("Clearing old orders...");
      const now = Date.now();
      const timeSpanAgo = subDays(zonedTimeToUtc(now, process.env.TZ!), 1);
      const locationsToSearch = DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P ? [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE, DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P] : [DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE];
      const oldOrdersResults = await SquareProviderInstance.SearchOrders(locationsToSearch, {
        filter: { dateTimeFilter: { updatedAt: { startAt: formatRFC3339(subDays(timeSpanAgo, 1)) } }, stateFilter: { states: ['OPEN'] } }, sort: { sortField: 'UPDATED_AT', sortOrder: 'ASC' }
      });
      logger.info({oldOrdersResults});
      if (oldOrdersResults.success) {
        const ordersToClose = (oldOrdersResults.result.orders ?? []).filter(x => (x.fulfillments ?? []).length === 1 && isBefore(utcToZonedTime(x.fulfillments![0].pickupDetails!.pickupAt!, process.env.TZ!), timeSpanAgo));
        for (let i = 0; i < ordersToClose.length; ++i) {
          const squareOrder = ordersToClose[i];
          try {
            const orderUpdateResponse = await SquareProviderInstance.OrderUpdate(squareOrder.locationId, squareOrder.id!, squareOrder.version!, {
              state: 'CLOSED',
              fulfillments: squareOrder.fulfillments?.map(x => ({
                uid: x.uid,
                state: 'COMPLETED'
              }))
            }, []);
            if (orderUpdateResponse.success) {
              logger.debug(`Marked order ${squareOrder.id!} as completed`);
            }
          } catch (err1: any) {
            logger.error(`Skipping ${squareOrder.id!} due to error ingesting: ${JSON.stringify(err1, Object.getOwnPropertyNames(err1), 2)}`);
          }
        }
      }
    }
    catch (err: any) {
      const errorDetail = `Got error when attempting to ingest 3p orders: ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}`;
      logger.error(errorDetail);
    }
  }


  private Query3pOrders = async () => {
    try {
      const now = Date.now();
      const timeSpanAgo = subMinutes(zonedTimeToUtc(now, process.env.TZ!), 10);
      const recentlyUpdatedOrdersResponse = await SquareProviderInstance.SearchOrders([DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P], {
        filter: { dateTimeFilter: { updatedAt: { startAt: formatRFC3339(timeSpanAgo) } } }, sort: { sortField: 'UPDATED_AT', sortOrder: 'ASC' }
      });
      if (recentlyUpdatedOrdersResponse.success) {
        const fulfillmentConfig = DataProviderInstance.Fulfillments[DataProviderInstance.KeyValueConfig.THIRD_PARTY_FULFILLMENT]!;
        const ordersToInspect = (recentlyUpdatedOrdersResponse.result.orders ?? []).filter(x => x.lineItems && x.lineItems.length > 0 && x.fulfillments?.length === 1);
        const squareOrderIds = ordersToInspect.map(x => x.id!);
        const found3pOrders = await WOrderInstanceModel.find({ 'fulfillment.thirdPartyInfo.squareId': { $in: squareOrderIds } }).exec();
        const ordersToIngest = ordersToInspect.filter(x => found3pOrders.findIndex(order => order.fulfillment.thirdPartyInfo!.squareId === x.id!) === -1);
        const orderInstances: Omit<WOrderInstance, "id">[] = [];
        ordersToIngest.forEach(squareOrder => {
          const fulfillmentDetails = squareOrder.fulfillments![0];
          const requestedFulfillmentTime = WDateUtils.ComputeFulfillmentTime(setMilliseconds(setSeconds(utcToZonedTime(fulfillmentDetails.pickupDetails!.pickupAt!, process.env.TZ!), 0), 0));
          const fulfillmentTimeClampedRounded = Math.floor(requestedFulfillmentTime.selectedTime / fulfillmentConfig.timeStep) * fulfillmentConfig.timeStep;
          let adjustedFulfillmentTime = requestedFulfillmentTime.selectedTime;
          const [givenName, familyFirstLetter] = (fulfillmentDetails.pickupDetails?.recipient?.displayName ?? "ABBIE NORMAL").split(' ');
          try {
            // generate the WARIO cart from the square order
            const cart = LineItemsToOrderInstanceCart(squareOrder.lineItems!);

            // determine what available time we have for this order
            const cartLeadTime = DetermineCartBasedLeadTime(cart, CatalogProviderInstance.CatalogSelectors.productEntry);
            const availabilityMap = WDateUtils.GetInfoMapForAvailabilityComputation([fulfillmentConfig], requestedFulfillmentTime.selectedDate, cartLeadTime);
            const optionsForSelectedDate = WDateUtils.GetOptionsForDate(availabilityMap, requestedFulfillmentTime.selectedDate, formatISO(now))
            const foundTimeOptionIndex = optionsForSelectedDate.findIndex(x => x.value >= fulfillmentTimeClampedRounded);
            if (foundTimeOptionIndex === -1 || optionsForSelectedDate[foundTimeOptionIndex].disabled) {
              const errorDetail = `Requested fulfillment (${fulfillmentConfig.displayName}) at ${WDateUtils.MinutesToPrintTime(requestedFulfillmentTime.selectedTime)} is no longer valid and could not find suitable time. Ignoring WARIO timing and sending order for originally requested time.`;
              logger.error(errorDetail)
            }
            else {
              adjustedFulfillmentTime = optionsForSelectedDate[foundTimeOptionIndex].value;
            }

            orderInstances.push({
              customerInfo: {
                email: DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS,
                givenName,
                familyName: familyFirstLetter,
                mobileNum: fulfillmentDetails.pickupDetails?.recipient?.phoneNumber ?? "2064864743",
                referral: ""
              },
              discounts: [],
              fulfillment: {
                selectedDate: requestedFulfillmentTime.selectedDate,
                selectedTime: adjustedFulfillmentTime,
                selectedService: DataProviderInstance.KeyValueConfig.THIRD_PARTY_FULFILLMENT,
                status: WFulfillmentStatus.PROPOSED,
                thirdPartyInfo: { squareId: squareOrder.id!, source: Map3pSource(squareOrder.source?.name ?? "") },
              },
              locked: null,
              metadata: [{ key: 'SQORDER', value: squareOrder.id! }],
              payments: squareOrder.tenders?.map((x): OrderPaymentAllocated => ({
                t: PaymentMethod.Cash,
                amount: BigIntMoneyToIntMoney(x.amountMoney!),
                createdAt: Date.now(),
                status: TenderBaseStatus.COMPLETED,
                tipAmount: { amount: 0, currency: CURRENCY.USD },
                processorId: x.paymentId!,
                payment: {
                  amountTendered: BigIntMoneyToIntMoney(x.amountMoney!),
                  change: { amount: 0, currency: CURRENCY.USD },
                }
              })) ?? [],
              refunds: [],
              tip: { isPercentage: false, isSuggestion: false, value: { amount: 0, currency: CURRENCY.USD } },
              taxes: squareOrder.taxes?.map((x => ({ amount: BigIntMoneyToIntMoney(x.appliedMoney!) }))) ?? [],
              status: WOrderStatus.OPEN,
              cart,
              specialInstructions: (requestedFulfillmentTime.selectedTime !== adjustedFulfillmentTime) ? `ORT: ${WDateUtils.MinutesToPrintTime(requestedFulfillmentTime.selectedTime)}` : undefined,
            })
          }
          catch (err: any) {
            logger.error(`Skipping ${JSON.stringify(ordersToInspect)} due to error ingesting.`)
          }
        });
        if (orderInstances.length > 0) {
          logger.info(`Inserting ${orderInstances.length} 3p orders... ${JSON.stringify(orderInstances)}`);
          const saveResponse = await WOrderInstanceModel.bulkSave(orderInstances.map(x => new WOrderInstanceModel(x)));
          logger.info(`Save response for 3p order: ${JSON.stringify(saveResponse)}`);
        }
      }
    }
    catch (err: any) {
      const errorDetail = `Got error when attempting to ingest 3p orders: ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}`;
      logger.error(errorDetail);
    }
  }

  /**
   * Finds UNLOCKED orders due within the next GetEndOfSendingRange with 
   * proposed fulfillment status and sends them, setting the fulfillment status to SENT
   */
  private SendOrders = async () => {
    const idempotencyKey = crypto.randomBytes(22).toString('hex');
    const now = zonedTimeToUtc(Date.now(), process.env.TZ!)
    const endOfRange = GetEndOfSendingRange(now);
    const isEndRangeSameDay = isSameDay(now, endOfRange);
    const endOfRangeAsFT = WDateUtils.ComputeFulfillmentTime(endOfRange);
    const endOfRangeAsQuery = { 'fulfillment.selectedDate': endOfRangeAsFT.selectedDate, 'fulfillment.selectedTime': { $lte: endOfRangeAsFT.selectedTime } };
    const timeConstraint = isEndRangeSameDay ?
      endOfRangeAsQuery :
      { $or: [{ 'fulfillment.selectedDate': WDateUtils.formatISODate(now) }, endOfRangeAsQuery] }
    //logger.debug(`Running SendOrders job for the time constraint: ${JSON.stringify(timeConstraint)}`);
    await WOrderInstanceModel.updateMany({
      status: WOrderStatus.CONFIRMED,
      'locked': null,
      'fulfillment.status': WFulfillmentStatus.PROPOSED,
      ...timeConstraint
    },
      { locked: idempotencyKey }
    )
      .then(async (updateResult) => {
        if (updateResult.modifiedCount > 0) {
          logger.info(`Locked ${updateResult.modifiedCount} orders with service before ${formatISO(endOfRange)}`);
          return await WOrderInstanceModel.find({
            locked: idempotencyKey
          })
            .then(async (lockedOrders) => {
              // for loop keeps it sequential / synchronous
              for (let i = 0; i < lockedOrders.length; ++i) {
                await this.SendLockedOrder(lockedOrders[i].toObject(), true);
              }
            })
        }
      })
  }

  private LockAndActOnOrder = async (
    idempotencyKey: string,
    orderId: string,
    testDbOrder: FilterQuery<WOrderInstance>,
    onSuccess: (order: WOrderInstance) => Promise<ResponseWithStatusCode<CrudOrderResponse>>): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    logger.info(`Received request (nonce: ${idempotencyKey}) attempting to lock Order ID: ${orderId}`);
    return await WOrderInstanceModel.findOneAndUpdate(
      { _id: orderId, locked: null, ...testDbOrder },
      { locked: idempotencyKey },
      { new: true })
      .then(async (order): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
        if (!order) {
          return { status: 404, success: false, error: [{ category: 'INVALID_REQUEST_ERROR', code: 'UNEXPECTED_VALUE', detail: 'Order not found/locked' }] };
        }
        return await onSuccess(order.toObject());
      })
      .catch((err: any) => {
        const errorDetail = `Unable to find ${orderId}. Got error: ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}`;
        logger.error(errorDetail);
        return { status: 404, success: false, error: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND', detail: errorDetail }] };
      });
  }

  /**
   * 
   * @param lockedOrder 
   * @returns 
   */
  private SendMoveLockedOrderTicket = async (lockedOrder: WOrderInstance, destination: string, additionalMessage: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    logger.debug(`Sending move ticket for order ${JSON.stringify({ id: lockedOrder.id, fulfillment: lockedOrder.fulfillment, customerInfo: lockedOrder.customerInfo }, null, 2)}.`);
    try {
      // send order to alternate location
      const customerName = `${lockedOrder.customerInfo.givenName} ${lockedOrder.customerInfo.familyName}`;
      const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
      const promisedTime = DateTimeIntervalBuilder(lockedOrder.fulfillment, fulfillmentConfig);
      const rebuiltCart = RebuildAndSortCart(lockedOrder.cart, CatalogProviderInstance.CatalogSelectors, promisedTime.start, fulfillmentConfig.id);
      const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment, rebuiltCart, lockedOrder.specialInstructions ?? "")

      const SQORDER_MSG = lockedOrder.metadata.find(x => x.key === 'SQORDER_MSG')?.value?.split(',') ?? [];
      const expoPrinters = Object.values(CatalogProviderInstance.PrinterGroups).filter(x => x.isExpo);
      if (expoPrinters.length > 0) {
        const message = [`Move to ${destination}`, ...(additionalMessage ? [additionalMessage] : [])];
        const messages = expoPrinters.map(pg => ({
          squareItemVariationId: GetSquareIdFromExternalIds(pg.externalIDs, 'ITEM_VARIATION')!,
          message: message
        }))
        const messageOrder = CreateOrderForMessages(
          DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE,
          lockedOrder.id,
          eventTitle,
          messages,
          {
            displayName: `MOVE ${eventTitle}`,
            emailAddress: lockedOrder.customerInfo.email,
            phoneNumber: lockedOrder.customerInfo.mobileNum,
            pickupAt: promisedTime.start
          });
        const messageOrderResponse = await SquareProviderInstance.SendMessageOrder(messageOrder);
        if (messageOrderResponse !== false) {
          SQORDER_MSG.push(messageOrderResponse.order!.id!);
        }
      }

      // update order in DB, release lock
      return await WOrderInstanceModel.findOneAndUpdate(
        { locked: lockedOrder.locked, _id: lockedOrder.id },
        {
          locked: null,
          metadata: [
            ...lockedOrder.metadata.filter(x => !['SQORDER_MSG'].includes(x.key)),
            ...(SQORDER_MSG.length > 0 ? [{ key: 'SQORDER_MSG', value: SQORDER_MSG.join(',') }] : []),
          ]
        },
        { new: true })
        .then(async (updatedOrder): Promise<ResponseWithStatusCode<ResponseSuccess<WOrderInstance>>> => {
          return { success: true, status: 200, result: updatedOrder!.toObject() };
        })
        .catch((err: any) => {
          throw err;
        })
    } catch (error: any) {
      const errorDetail = `Caught error when attempting to send move ticket: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`;
      logger.error(errorDetail);
      try {
        await WOrderInstanceModel.findOneAndUpdate(
          { _id: lockedOrder.id },
          { locked: null });
      } catch (err2: any) {
        logger.error(`Got even worse error in attempting to release lock on order we failed to finish send processing: ${JSON.stringify(err2, Object.getOwnPropertyNames(err2), 2)}`)
      }
      return { status: 500, success: false, error: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
    }
  }

  /**
   * 
   * @param lockedOrder 
   * @returns 
   */
  private SendLockedOrder = async (lockedOrder: WOrderInstance, releaseLock: boolean): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    logger.debug(`Sending order ${JSON.stringify({ id: lockedOrder.id, fulfillment: lockedOrder.fulfillment, customerInfo: lockedOrder.customerInfo }, null, 2)}, lock applied.`);
    try {
      // send order to alternate location
      const customerName = `${lockedOrder.customerInfo.givenName} ${lockedOrder.customerInfo.familyName}`;
      const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
      const promisedTime = DateTimeIntervalBuilder(lockedOrder.fulfillment, fulfillmentConfig);
      const rebuiltCart = RebuildAndSortCart(lockedOrder.cart, CatalogProviderInstance.CatalogSelectors, promisedTime.start, fulfillmentConfig.id);
      const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment, rebuiltCart, lockedOrder.specialInstructions ?? "")
      const messageOrders = CreateOrdersForPrintingFromCart(
        DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE,
        lockedOrder.id,
        eventTitle,
        Object.values(rebuiltCart).flat(),
        {
          displayName: `${WDateUtils.MinutesToPrintTime(lockedOrder.fulfillment.selectedTime)} ${eventTitle}`,
          emailAddress: lockedOrder.customerInfo.email,
          phoneNumber: lockedOrder.customerInfo.mobileNum,
          pickupAt: promisedTime.start,
          note: lockedOrder.specialInstructions ?? undefined
        })

      const SQORDER_PRINT = lockedOrder.metadata.find(x => x.key === 'SQORDER_PRINT')?.value?.split(',') ?? [];
      const messageOrderResponses: SquareOrder[] = [];
      for (let i = 0; i < messageOrders.length; ++i) {
        const messageOrderResponse = await SquareProviderInstance.SendMessageOrder(messageOrders[i]);
        if (messageOrderResponse !== false) {
          messageOrderResponses.push(messageOrderResponse.order!);
        }
      }
      SQORDER_PRINT.push(...messageOrderResponses.map(x => x.id!));

      const updatedOrder = {
        ...lockedOrder,
        ...(releaseLock ? { locked: null } : {}),
        fulfillment: { ...lockedOrder.fulfillment, status: WFulfillmentStatus.SENT },
        metadata: [
          ...lockedOrder.metadata.filter(x => x.key !== 'SQORDER_PRINT' && x.key !== 'SQPAYMENT_PRINT'),
          { key: 'SQORDER_PRINT', value: SQORDER_PRINT.join(',') },
        ]
      }
      // update order in DB, release lock (if requested)
      return await WOrderInstanceModel.findOneAndUpdate(
        { locked: lockedOrder.locked, _id: lockedOrder.id },
        updatedOrder,
        { new: true })
        .then(async (updated): Promise<ResponseWithStatusCode<ResponseSuccess<WOrderInstance>>> => {
          return { success: true, status: 200, result: updated!.toObject() };
        })
        .catch((err: any) => {
          throw err;
        })
    } catch (error: any) {
      const errorDetail = `Caught error when attempting to send order: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`;
      logger.error(errorDetail);
      if (releaseLock) {
        try {
          await WOrderInstanceModel.findOneAndUpdate(
            { _id: lockedOrder.id },
            { locked: null });
        } catch (err2: any) {
          logger.error(`Got even worse error in attempting to release lock on order we failed to finish send processing: ${JSON.stringify(err2, Object.getOwnPropertyNames(err2), 2)}`)
        }
      }
      return { status: 500, success: false, error: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
    }
  }

  private CancelLockedOrder = async (lockedOrder: WOrderInstance, reason: string, emailCustomer: boolean): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    logger.debug(`Found order to cancel for ${JSON.stringify(lockedOrder.customerInfo, null, 2)}, order ID: ${lockedOrder.id}. lock applied.`);
    const errors: WError[] = [];
    try {
      const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
      const is3pOrder = fulfillmentConfig.service === FulfillmentType.ThirdParty;
      const squareOrderId = lockedOrder.metadata.find(x => x.key === 'SQORDER')!.value;

      if (!is3pOrder) {
        // refund store credits
        const discountCreditRefunds = await Promise.all(lockedOrder.discounts.flatMap(async (discount) => {
          if (discount.t === DiscountMethod.CreditCodeAmount) {
            const refundedDiscount = await StoreCreditProviderInstance.RefundStoreCredit(discount.discount.code, discount.discount.amount, 'WARIO');
            return [refundedDiscount];
          }
          return [];
        }));
      }

      // refund square payments
      await Promise.all(lockedOrder.payments.map(async (payment) => {
        if (payment.t === PaymentMethod.StoreCredit) {
          // refund the credit in the store credit DB
          await StoreCreditProviderInstance.RefundStoreCredit(payment.payment.code, payment.amount, 'WARIO');
        }
        let undoPaymentResponse;
        if (lockedOrder.status === WOrderStatus.CONFIRMED) {
          undoPaymentResponse = await SquareProviderInstance.RefundPayment(payment.processorId, payment.amount, reason);
        } else {
          undoPaymentResponse = await SquareProviderInstance.CancelPayment(payment.processorId);
        }
        if (!undoPaymentResponse.success) {
          const errorDetail = `Failed to process payment refund for payment ID: ${payment.processorId}`;
          logger.error(errorDetail);
          undoPaymentResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }));
        }
        return undoPaymentResponse;
      }));
      if (errors.length > 0) {
        // maybe this should result in some more sophisticated cleanup, but we haven't seen a failure here yet
        logger.error('Got errors when refunding payments. Sending email to the big giant head');
        GoogleProviderInstance.SendEmail(
          DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS,
          { name: DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS, address: "dave@windycitypie.com" },
          "ERROR IN REFUND PROCESSING. CONTACT DAVE IMMEDIATELY",
          "dave@windycitypie.com",
          `<p>Errors: ${JSON.stringify(errors)}</p>`);
      }

      const cancelMessageOrderResponses: SquareOrder[] = [];
      const SQORDER_MSG = lockedOrder.metadata.find(x => x.key === 'SQORDER_MSG')?.value?.split(',') ?? [];
      const SQORDER_PRINT = lockedOrder.metadata.find(x => x.key === 'SQORDER_PRINT')?.value?.split(',') ?? [];
      // * Cancel the printer orders we previously sent if the order's fulfillment is in state SENT
      // then send message on cancelation to relevant printer groups (this might not be necessary any longer)
      // do this here to give the refunds time to process, which hopefully results in the +2 increment in the order version
      if (lockedOrder.fulfillment.status === WFulfillmentStatus.SENT || lockedOrder.fulfillment.status === WFulfillmentStatus.PROCESSING) {
        const printOrders: SquareOrder[] = [];
        if (SQORDER_PRINT.length > 0) {
          const batchOrders = await SquareProviderInstance.BatchRetrieveOrders(DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE, SQORDER_PRINT);
          if (batchOrders.success) {
            printOrders.push(...(batchOrders.result?.orders ?? []))
          }
        }

        for (let pIdx = 0; pIdx < printOrders.length; ++pIdx) {
          if (printOrders[pIdx].state === 'OPEN') {
            const updateSquareOrderResponse = await SquareProviderInstance.OrderUpdate(
              DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE,
              printOrders[pIdx].id!,
              printOrders[pIdx].version!, {
              fulfillments: printOrders[pIdx].fulfillments?.map(x => ({
                uid: x.uid,
                state: 'CANCELED',
                pickupDetails: { canceledAt: formatRFC3339(Date.now()), cancelReason: reason }
              })) ?? []
            }, []);
          }
        }
        SQORDER_PRINT.splice(0);

        const promisedTime = DateTimeIntervalBuilder(lockedOrder.fulfillment, fulfillmentConfig);
        const oldPromisedTime = WDateUtils.ComputeServiceDateTime(lockedOrder.fulfillment);
        const customerName = `${lockedOrder.customerInfo.givenName} ${lockedOrder.customerInfo.familyName}`;
        const rebuiltCart = RebuildAndSortCart(lockedOrder.cart, CatalogProviderInstance.CatalogSelectors, promisedTime.start, fulfillmentConfig.id);
        const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment, rebuiltCart, lockedOrder.specialInstructions ?? "")
        const flatCart = Object.values(rebuiltCart).flat();
        // get mapping from printerGroupId to list CoreCartEntry<WProduct> being adjusted for that pgId
        const messages = Object.entries(CartByPrinterGroup(flatCart)).map(([pgId, entries]) => ({
          squareItemVariationId: GetSquareIdFromExternalIds(CatalogProviderInstance.PrinterGroups[pgId]!.externalIDs, 'ITEM_VARIATION')!,
          message: entries.map(x => `CANCEL ${x.quantity}x:${x.product.m.name}`)
        }))
        // get all dummy message item variations for the printerGroups
        const messageOrder = CreateOrderForMessages(
          DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE,
          lockedOrder.id,
          eventTitle,
          messages,
          {
            displayName: `CANCEL ${eventTitle}`,
            emailAddress: lockedOrder.customerInfo.email,
            phoneNumber: lockedOrder.customerInfo.mobileNum,
            pickupAt: oldPromisedTime,
            note: `CANCEL ${eventTitle}`
          });
        const messageOrderResponse = await SquareProviderInstance.SendMessageOrder(messageOrder);
        if (messageOrderResponse !== false) {
          cancelMessageOrderResponses.push(messageOrderResponse.order!);
        }
      }
      SQORDER_MSG.push(...cancelMessageOrderResponses.map(x => x.id!));

      // lookup Square Order for payments and version number
      const retrieveSquareOrderResponse = await SquareProviderInstance.RetrieveOrder(squareOrderId);
      if (!retrieveSquareOrderResponse.success) {
        // unable to find the order
        retrieveSquareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }));
        return { status: 404, success: false, error: errors };
      }

      const orderVersion = retrieveSquareOrderResponse.result.order!.version!;
      
      const squareOrder = retrieveSquareOrderResponse.result.order!;
      // cancel square fulfillment(s) and the order if it's not paid
      if (squareOrder.state === 'OPEN') {
        const updateSquareOrderResponse = await SquareProviderInstance.OrderUpdate(
          DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
          squareOrderId,
          orderVersion, {
          ...(lockedOrder.status === WOrderStatus.OPEN ? { state: 'CANCELED' } : {}),
          fulfillments: squareOrder.fulfillments?.map(x => ({
            uid: x.uid,
            state: 'CANCELED'
          })) ?? []
        }, []);
        if (!updateSquareOrderResponse.success) {
          updateSquareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }));
          return { status: 500, success: false, error: errors };
        }
      } else {
        // is this an error condition?
      }

      // send email if we're supposed to
      if (!is3pOrder && emailCustomer) {
        await CreateExternalCancelationEmail(lockedOrder, reason);
      }

      // delete calendar entry
      const gCalEventId = lockedOrder.metadata.find(x => x.key === 'GCALEVENT')?.value;
      if (gCalEventId) {
        await GoogleProviderInstance.DeleteCalendarEvent(gCalEventId);
      }

      // update order in DB, release lock
      return await WOrderInstanceModel.findOneAndUpdate(
        { locked: lockedOrder.locked, _id: lockedOrder.id },
        {
          locked: null,
          status: WOrderStatus.CANCELED,
          'fulfillment.status': WFulfillmentStatus.CANCELED,
          metadata: [
            ...lockedOrder.metadata.filter(x => !['SQORDER_PRINT', 'SQORDER_MSG'].includes(x.key)),
            ...(SQORDER_PRINT.length > 0 ? [{ key: 'SQORDER_PRINT', value: SQORDER_PRINT.join(',') }] : []),
            ...(SQORDER_MSG.length > 0 ? [{ key: 'SQORDER_MSG', value: SQORDER_MSG.join(',') }] : []),
          ]
          // TODO: need to add refunds to the order too?
        },
        { new: true })
        .then(async (updatedOrder): Promise<ResponseWithStatusCode<ResponseSuccess<WOrderInstance>>> => {
          const updatedOrderObject = updatedOrder!.toObject();
          // TODO: free up order slot and unblock time as appropriate

          // send notice to subscribers

          // return to caller
          SocketIoProviderInstance.EmitOrder(updatedOrderObject);
          return { status: 200, success: true, result: updatedOrderObject };
        })
        .catch((err: any) => {
          const errorDetail = `Unable to commit update to order to release lock and cancel. Got error: ${JSON.stringify(err, null, 2)}`;
          return { status: 500, success: false, error: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
        })
    } catch (error: any) {
      const errorDetail = `Caught error when attempting to cancel order: ${JSON.stringify(error, null, 2)}`;
      logger.error(errorDetail);
      return { status: 500, success: false, error: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
    }
  }

  /**
   * TODO: NEEDS IMPLEMENTATION
   * @param lockedOrder Order in OPEN or CONFIRMED state, with fulfillment in PROPOSED or SENT state
   * @returns 
   */
  private ModifyLockedOrder = async (lockedOrder: WOrderInstance, orderUpdate: Partial<Pick<WOrderInstance, 'customerInfo' | 'cart' | 'discounts' | 'fulfillment' | 'specialInstructions' | 'tip'>>): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    const updatedOrder = { ...lockedOrder, ...orderUpdate };
    const fulfillmentConfig = DataProviderInstance.Fulfillments[updatedOrder.fulfillment.selectedService];
    const is3pOrder = fulfillmentConfig.service === FulfillmentType.ThirdParty;
    const promisedTime = DateTimeIntervalBuilder(lockedOrder.fulfillment, fulfillmentConfig);
    const oldPromisedTime = WDateUtils.ComputeServiceDateTime(lockedOrder.fulfillment);
    logger.info(`Adjusting order in status: ${lockedOrder.status} with fulfillment status ${lockedOrder.fulfillment.status} to new time of ${format(promisedTime.start, WDateUtils.ISODateTimeNoOffset)}`);
    const customerName = `${lockedOrder.customerInfo.givenName} ${lockedOrder.customerInfo.familyName}`;
    const rebuiltCart = RebuildAndSortCart(lockedOrder.cart, CatalogProviderInstance.CatalogSelectors, promisedTime.start, fulfillmentConfig.id);
    const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment, rebuiltCart, lockedOrder.specialInstructions ?? "")
    const flatCart = Object.values(rebuiltCart).flat();

    // TODO: this doesn't work as it doesn't properly handle updated discounts or store credit redemptions
    const recomputedTotals = RecomputeTotals({ cart: rebuiltCart, fulfillment: fulfillmentConfig, order: updatedOrder, payments: updatedOrder.payments, discounts: updatedOrder.discounts, config: { SERVICE_CHARGE: 0, AUTOGRAT_THRESHOLD: DataProviderInstance.Settings.config.AUTOGRAT_THRESHOLD as number ?? 5, TAX_RATE: DataProviderInstance.Settings.config.TAX_RATE as number ?? .1025, CATALOG_SELECTORS: CatalogProviderInstance.CatalogSelectors } });

    // adjust calendar event
    const gCalEventId = lockedOrder.metadata.find(x => x.key === 'GCALEVENT')?.value;
    if (gCalEventId) {
      const dateTimeInterval = DateTimeIntervalBuilder(updatedOrder.fulfillment, fulfillmentConfig);
      const updatedOrderEventJson = GenerateOrderEventJson(
        eventTitle,
        updatedOrder,
        rebuiltCart,
        dateTimeInterval,
        recomputedTotals);
      await GoogleProviderInstance.ModifyCalendarEvent(gCalEventId, updatedOrderEventJson);
    }
    throw "This shit doesn't work yet.";

    // adjust DB event
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: lockedOrder.locked, _id: lockedOrder.id },
      {
        ...updatedOrder,
        locked: null,
      },
      { new: true })
      .then(async (updatedOrder) => {
        // return success/failure
        SocketIoProviderInstance.EmitOrder(updatedOrder!.toObject());
        return { status: 200, success: true, error: [], result: updatedOrder! };
      })
      .catch((err: any) => {
        const errorDetail = `Unable to commit update to order to release lock and update fulfillment time. Got error: ${JSON.stringify(err, null, 2)}`;
        logger.error(errorDetail);
        return { status: 500, success: false, error: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
      })
  }

  /**
   * 
   * @param lockedOrder Order in OPEN or CONFIRMED state, with fulfillment in PROPOSED or SENT state
   * @param newTime 
   * @param emailCustomer 
   * @returns 
   */
  private AdjustLockedOrderTime = async (lockedOrder: WOrderInstance, newTime: FulfillmentTime, emailCustomer: boolean, additionalMessage: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    let updatedOrder: WOrderInstance = { ...lockedOrder, fulfillment: { ...lockedOrder.fulfillment, ...newTime } };
    const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
    const is3pOrder = fulfillmentConfig.service === FulfillmentType.ThirdParty;
    const promisedTime = DateTimeIntervalBuilder(lockedOrder.fulfillment, fulfillmentConfig);
    const oldPromisedTime = WDateUtils.ComputeServiceDateTime(lockedOrder.fulfillment);
    logger.info(`Adjusting order in status: ${lockedOrder.status} with fulfillment status ${lockedOrder.fulfillment.status} to new time of ${format(promisedTime.start, WDateUtils.ISODateTimeNoOffset)}`);
    const customerName = `${lockedOrder.customerInfo.givenName} ${lockedOrder.customerInfo.familyName}`;
    const rebuiltCart = RebuildAndSortCart(lockedOrder.cart, CatalogProviderInstance.CatalogSelectors, promisedTime.start, fulfillmentConfig.id);
    const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment, rebuiltCart, lockedOrder.specialInstructions ?? "")
    const flatCart = Object.values(rebuiltCart).flat();

    const SQORDER_MSG = lockedOrder.metadata.find(x => x.key === 'SQORDER_MSG')?.value?.split(',') ?? [];
    const SQORDER_PRINT = lockedOrder.metadata.find(x => x.key === 'SQORDER_PRINT')?.value?.split(',') ?? [];

    // if the order has SENT fulfillment, we need to notify all relevant printer groups of the new time
    if (lockedOrder.fulfillment.status === WFulfillmentStatus.SENT) {
      // cancel any existing print orders
      const printOrders: SquareOrder[] = [];
      if (SQORDER_PRINT.length > 0) {
        const batchOrders = await SquareProviderInstance.BatchRetrieveOrders(DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE, SQORDER_PRINT);
        if (batchOrders.success) {
          printOrders.push(...(batchOrders.result?.orders ?? []))
        }
      }

      for (let pIdx = 0; pIdx < printOrders.length; ++pIdx) {
        if (printOrders[pIdx].state === 'OPEN') {
          const updateSquareOrderResponse = await SquareProviderInstance.OrderUpdate(
            DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE,
            printOrders[pIdx].id!,
            printOrders[pIdx].version!, {
            fulfillments: printOrders[pIdx].fulfillments?.map(x => ({
              uid: x.uid,
              state: 'CANCELED',
              pickupDetails: { canceledAt: formatRFC3339(Date.now()), cancelReason: "rescheduled" }
            })) ?? []
          }, []);
        }
      }
      SQORDER_PRINT.splice(0);

      // get mapping from printerGroupId to list CoreCartEntry<WProduct> being adjusted for that pgId
      const messages = Object.entries(CartByPrinterGroup(flatCart)).map(([pgId, entries]) => ({
        squareItemVariationId: GetSquareIdFromExternalIds(CatalogProviderInstance.PrinterGroups[pgId]!.externalIDs, 'ITEM_VARIATION')!,
        message: entries.map(x => `RESCHEDULE ${x.quantity}x:${x.product.m.name}`)
      }))
      // get all dummy message item variations for the printerGroups
      const messageOrder = CreateOrderForMessages(
        DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_ALTERNATE,
        lockedOrder.id,
        eventTitle,
        messages,
        {
          displayName: `RESCHEDULE ${eventTitle}`,
          emailAddress: lockedOrder.customerInfo.email,
          phoneNumber: lockedOrder.customerInfo.mobileNum,
          pickupAt: oldPromisedTime,
          note: `RESCHEDULED TO ${newTime.selectedDate} @ ${WDateUtils.MinutesToPrintTime(newTime.selectedTime)}${additionalMessage ? `\n${additionalMessage}` : ""}`
        });
      const messageOrderResponse = await SquareProviderInstance.SendMessageOrder(messageOrder);
      if (messageOrderResponse !== false) {
        SQORDER_MSG.push(messageOrderResponse.order!.id!);
      }
    }

    // adjust calendar event
    const gCalEventId = lockedOrder.metadata.find(x => x.key === 'GCALEVENT')?.value;
    if (gCalEventId) {
      const dateTimeInterval = DateTimeIntervalBuilder(newTime, fulfillmentConfig);
      await GoogleProviderInstance.ModifyCalendarEvent(gCalEventId, {
        start: {
          dateTime: formatRFC3339(dateTimeInterval.start),
          timeZone: process.env.TZ
        },
        end: {
          dateTime: formatRFC3339(dateTimeInterval.end),
          timeZone: process.env.TZ
        }
      })
    }
    // send email to customer
    if (!is3pOrder && emailCustomer) {
      await CreateExternalEmailForOrderReschedule(fulfillmentConfig, updatedOrder.fulfillment, lockedOrder.customerInfo, additionalMessage);
    }

    updatedOrder.fulfillment.status = WFulfillmentStatus.PROPOSED;
    updatedOrder = {
      ...updatedOrder, metadata: [
        ...updatedOrder.metadata.filter(x => !['SQORDER_PRINT', 'SQORDER_MSG'].includes(x.key)),
        ...(SQORDER_PRINT.length > 0 ? [{ key: 'SQORDER_PRINT', value: SQORDER_PRINT.join(',') }] : []),
        ...(SQORDER_MSG.length > 0 ? [{ key: 'SQORDER_MSG', value: SQORDER_MSG.join(',') }] : []),
      ]
    };

    // check if the order is confirmed or processing and within time range and send it if so
    if ((updatedOrder.status === WOrderStatus.CONFIRMED || updatedOrder.status === WOrderStatus.PROCESSING) &&
      isBefore(WDateUtils.ComputeServiceDateTime(newTime), GetEndOfSendingRange(zonedTimeToUtc(Date.now(), process.env.TZ!)))) {
      return await this.SendLockedOrder(updatedOrder, true);
    } else {
      updatedOrder.fulfillment.status = WFulfillmentStatus.PROPOSED;
    }

    // adjust DB event
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: lockedOrder.locked, _id: lockedOrder.id },
      {
        locked: null,
        fulfillment: updatedOrder.fulfillment,
        metadata: updatedOrder.metadata
      },
      { new: true })
      .then(async (updatedOrder) => {
        // return success/failure
        SocketIoProviderInstance.EmitOrder(updatedOrder!.toObject());
        return { status: 200, success: true, error: [], result: updatedOrder! };
      })
      .catch((err: any) => {
        const errorDetail = `Unable to commit update to order to release lock and update fulfillment time. Got error: ${JSON.stringify(err, null, 2)}`;
        logger.error(errorDetail);
        return { status: 500, success: false, error: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
      })
  }

  private ConfirmLockedOrder = async (lockedOrder: WOrderInstance, messageToCustomer: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
    const is3pOrder = fulfillmentConfig.service === FulfillmentType.ThirdParty;

    if (!is3pOrder) {
      // lookup Square Order
      const squareOrderId = lockedOrder.metadata.find(x => x.key === 'SQORDER')!.value;
      const retrieveSquareOrderResponse = await SquareProviderInstance.RetrieveOrder(squareOrderId);
      if (!retrieveSquareOrderResponse.success) {
        // unable to find the order
        return { status: 405, success: false, error: retrieveSquareOrderResponse.error.map(e => ({ category: e.category, code: e.code, detail: e.detail ?? "" })) };
      }
      const squareOrder = retrieveSquareOrderResponse.result.order!;
      if (squareOrder.state !== 'OPEN') {
        // unable to edit the order at this point, error out
        return { status: 405, success: false, error: [{ category: 'INVALID_REQUEST_ERROR', code: 'UNEXPECTED_VALUE', detail: 'Square order found, but not in a state where we can confirm it' }] };
      }

      // mark the order paid via PayOrder endpoint
      const payOrderResponse = await SquareProviderInstance.PayOrder(squareOrderId, squareOrder.tenders?.map(x => x.id!) ?? []);
      if (payOrderResponse.success) {
        logger.info(`Square order successfully marked paid.`);
        // send email to customer
        await CreateExternalConfirmationEmail(lockedOrder);
      } else {
        const errorDetail = `Failed to pay the order: ${JSON.stringify(payOrderResponse)}`;
        logger.error(errorDetail);
        return { status: 422, success: false, error: payOrderResponse.error.map(e => ({ category: e.category, code: e.code, detail: e.detail ?? "" })) };
      }
    }

    // check if the order is within time range and send it if so
    const endOfRange = GetEndOfSendingRange(zonedTimeToUtc(Date.now(), process.env.TZ!));
    if (isBefore(WDateUtils.ComputeServiceDateTime(lockedOrder.fulfillment), endOfRange)) {
      return await this.SendLockedOrder({ ...lockedOrder, status: WOrderStatus.CONFIRMED }, true);
    }

    // adjust DB event
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: lockedOrder.locked, _id: lockedOrder.id },
      { locked: null, status: WOrderStatus.CONFIRMED }, // TODO: payments status need to be changed as committed to the DB if not 3p
      { new: true })
      .then(async (updatedOrder) => {
        // return success/failure
        SocketIoProviderInstance.EmitOrder(updatedOrder!.toObject());
        return { status: 200, success: true, error: [], result: updatedOrder!.toObject() };
      })
      .catch((err: any) => {
        const errorDetail = `Unable to commit update to order to release lock and confirm order. Got error: ${JSON.stringify(err, null, 2)}`;
        logger.error(errorDetail);
        return { status: 500, success: false, error: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
      })
  };

  public GetOrder = async (orderId: string): Promise<WOrderInstance | null> => {
    // find order and return
    return await WOrderInstanceModel.findById(orderId);
  };

  public GetOrders = async (queryDate: string | null, queryStatus: WOrderStatus | null): Promise<WOrderInstance[]> => {
    // find orders and return
    const dateConstraint = queryDate ? { 'fulfillment.selectedDate': { $gte: queryDate } } : {};
    const statusConstraint = queryStatus ? { 'status': queryStatus } : {};
    return await WOrderInstanceModel.find({
      ...(dateConstraint),
      ...(statusConstraint)
    }).exec();
  };

  public ObliterateLocks = async () => {
    await WOrderInstanceModel.updateMany({}, { locked: null });
  }

  public SendMoveOrderTicket = async (idempotencyKey: string, orderId: string, destination: string, additionalMessage: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    return await this.LockAndActOnOrder(idempotencyKey, orderId,
      {
        status: { $in: [WOrderStatus.CONFIRMED, WOrderStatus.PROCESSING, WOrderStatus.COMPLETED] },
        'fulfillment.status': WFulfillmentStatus.SENT
      },
      (o) => this.SendMoveLockedOrderTicket(o, destination, additionalMessage)
    );
  }

  public SendOrder = async (idempotencyKey: string, orderId: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    return await this.LockAndActOnOrder(idempotencyKey, orderId,
      { status: { $nin: [WOrderStatus.CANCELED] } },
      (o) => this.SendLockedOrder(o, true)
    );
  }

  public CancelOrder = async (idempotencyKey: string, orderId: string, reason: string, emailCustomer: boolean): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    return await this.LockAndActOnOrder(idempotencyKey, orderId,
      { status: { $in: [WOrderStatus.OPEN, WOrderStatus.CONFIRMED] } },
      (o) => this.CancelLockedOrder(o, reason, emailCustomer)
    );
  }

  public AdjustOrderTime = async (idempotencyKey: string, orderId: string, newTime: FulfillmentTime, emailCustomer: boolean, additionalMessage: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    return await this.LockAndActOnOrder(idempotencyKey, orderId,
      {
        status: { $in: [WOrderStatus.OPEN, WOrderStatus.CONFIRMED] },
        'fulfillment.status': { $in: [WFulfillmentStatus.PROPOSED, WFulfillmentStatus.SENT] }
      },
      (o) => this.AdjustLockedOrderTime(o, newTime, emailCustomer, additionalMessage)
    );
  }

  public ConfirmOrder = async (idempotencyKey: string, orderId: string, messageToCustomer: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    return await this.LockAndActOnOrder(idempotencyKey, orderId,
      { status: WOrderStatus.OPEN },
      (o) => this.ConfirmLockedOrder(o, messageToCustomer)
    );
  }

  public CreateOrder = async (createOrderRequest: CreateOrderRequestV2, ipAddress: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    const requestTime = Date.now();

    logger.debug(`From ${ipAddress}, Create Order Request: ${JSON.stringify(createOrderRequest)}`);

    // 1. get the fulfillment and other needed constants from the DataProvider, generate a reference ID, quick computations
    if (!Object.hasOwn(DataProviderInstance.Fulfillments, createOrderRequest.fulfillment.selectedService)) {
      return { status: 404, success: false, error: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND', detail: "Fulfillment specified does not exist." }] };
    }
    const fulfillmentConfig = DataProviderInstance.Fulfillments[createOrderRequest.fulfillment.selectedService];
    const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
    const referenceId = requestTime.toString(36).toUpperCase();
    const dateTimeInterval = DateTimeIntervalBuilder(createOrderRequest.fulfillment, fulfillmentConfig);
    const customerName = [createOrderRequest.customerInfo.givenName, createOrderRequest.customerInfo.familyName].join(" ");
    const service_title = ServiceTitleBuilder(fulfillmentConfig.displayName, createOrderRequest.fulfillment, customerName, dateTimeInterval);
    // 2. Rebuild the order from the menu/catalog
    const menu = GenerateMenu(CatalogProviderInstance.CatalogSelectors, CatalogProviderInstance.Catalog.version, dateTimeInterval.start, createOrderRequest.fulfillment.selectedService);
    const { noLongerAvailable, rebuiltCart } = RebuildOrderState(menu, createOrderRequest.cart, dateTimeInterval.start, fulfillmentConfig.id);
    if (noLongerAvailable.length > 0) {
      const errorDetail = `Unable to rebuild order from current catalog data, missing: ${noLongerAvailable.map(x => x.product.m.name).join(', ')}`
      logger.warn(errorDetail);
      return {
        status: 410,
        success: false,
        error: [{ category: 'INVALID_REQUEST_ERROR', code: 'GONE', detail: errorDetail }]
      };
    }

    const shorthandEventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, createOrderRequest.fulfillment, rebuiltCart, createOrderRequest.specialInstructions ?? "");

    // 3. let's setup the order object reference
    const orderInstance: WOrderInstancePartial = {
      cart: createOrderRequest.cart,
      customerInfo: createOrderRequest.customerInfo,
      fulfillment: {
        dineInInfo: createOrderRequest.fulfillment.dineInInfo ?? undefined,
        deliveryInfo: createOrderRequest.fulfillment.deliveryInfo ?? undefined,
        selectedService: createOrderRequest.fulfillment.selectedService,
        selectedDate: WDateUtils.formatISODate(dateTimeInterval.start), // REFORMAT THE DATE HERE FOR SAFETY
        selectedTime: createOrderRequest.fulfillment.selectedTime,
        status: WFulfillmentStatus.PROPOSED,
      },
      metrics: {
        ...createOrderRequest.metrics!,
        ipAddress
      },
      tip: createOrderRequest.tip,
      specialInstructions: createOrderRequest.specialInstructions
    }

    // 3. recompute the totals to ensure everything matches up, and to get some needed computations that we don't want to pass over the wire and blindly trust
    const recomputedTotals = RecomputeTotals({ cart: rebuiltCart, payments: createOrderRequest.proposedPayments, discounts: createOrderRequest.proposedDiscounts, fulfillment: fulfillmentConfig, order: orderInstance, config: { SERVICE_CHARGE: 0, AUTOGRAT_THRESHOLD: DataProviderInstance.Settings.config.AUTOGRAT_THRESHOLD as number ?? 5, TAX_RATE: DataProviderInstance.Settings.config.TAX_RATE as number ?? .1025, CATALOG_SELECTORS: CatalogProviderInstance.CatalogSelectors } });
    if (recomputedTotals.balanceAfterPayments.amount > 0) {
      const errorDetail = `Proposed payments yield balance of ${MoneyToDisplayString(recomputedTotals.balanceAfterPayments, true)}.`;
      logger.error(errorDetail)
      return {
        status: 500,
        success: false,
        error: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: errorDetail }]
      };
    }

    if (recomputedTotals.tipAmount.amount < recomputedTotals.tipMinimum.amount) {
      const errorDetail = `Computed tip below minimum of ${MoneyToDisplayString(recomputedTotals.tipMinimum, true)} vs sent: ${MoneyToDisplayString(recomputedTotals.tipAmount, true)}`;
      logger.error(errorDetail)
      return {
        status: 500,
        success: false,
        error: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: errorDetail }]
      };
    }

    // 4. check the availability of the requested service date/time
    const cartLeadTime = DetermineCartBasedLeadTime(createOrderRequest.cart, CatalogProviderInstance.CatalogSelectors.productEntry);
    const availabilityMap = WDateUtils.GetInfoMapForAvailabilityComputation([DataProviderInstance.Fulfillments[createOrderRequest.fulfillment.selectedService]], createOrderRequest.fulfillment.selectedDate, cartLeadTime);
    const optionsForSelectedDate = WDateUtils.GetOptionsForDate(availabilityMap, createOrderRequest.fulfillment.selectedDate, formatISO(requestTime))
    const foundTimeOptionIndex = optionsForSelectedDate.findIndex(x => x.value === createOrderRequest.fulfillment.selectedTime);
    if (foundTimeOptionIndex === -1 || optionsForSelectedDate[foundTimeOptionIndex].disabled) {
      const display_time = DateTimeIntervalToDisplayServiceInterval(dateTimeInterval);
      const errorDetail = `Requested fulfillment (${fulfillmentConfig.displayName}) at ${display_time} is no longer valid. ${optionsForSelectedDate.length > 0 ? `Next available time for date selected is ${WDateUtils.MinutesToPrintTime(optionsForSelectedDate[0].value)}. Please submit the order again.` : 'No times left for selected date.'}`;
      logger.error(errorDetail)
      return {
        status: 410,
        success: false,
        error: [{ category: 'INVALID_REQUEST_ERROR', code: 'GONE', detail: errorDetail }]
      };
    }

    // 5. Everything checks out, start making service calls (payment and order related)
    let errors: WError[] = [];
    let squareOrder: SquareOrder | null = null;
    let squareOrderVersion = 0;
    const discounts: OrderLineDiscount[] = []
    const sentPayments: OrderPaymentAllocated[] = [];
    const storeCreditResponses: ValidateLockAndSpendSuccess[] = [];
    try {
      // Payment part A: attempt to process discounts
      await Promise.all(recomputedTotals.discountApplied.map(async (proposedDiscount) => {
        // unsure if we want to validate the credit even if for some reason the amount allocated is 0
        if (proposedDiscount.t === DiscountMethod.CreditCodeAmount /* && proposedDiscount.discount.amount.amount > 0 */) {
          const response = await StoreCreditProviderInstance.ValidateLockAndSpend({ code: proposedDiscount.discount.code, amount: proposedDiscount.discount.amount, lock: proposedDiscount.discount.lock, updatedBy: STORE_NAME })
          if (!response.success) {
            errors.push({ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: "Unable to debit store credit." });
            throw errors;
          }
          storeCreditResponses.push(response);
        }
        discounts.push({
          ...proposedDiscount,
          // perhaps status should be APPROVED until the order is actually closed out
          status: TenderBaseStatus.COMPLETED,
        });
      }));

      // Payment Part B: make an order
      const squareOrderResponse = await SquareProviderInstance.CreateOrder(
        CreateOrderFromCart(
          DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
          referenceId,
          discounts,
          [{ amount: recomputedTotals.taxAmount }],
          Object.values(rebuiltCart).flat(),
          recomputedTotals.hasBankersRoundingTaxSkew,
          shorthandEventTitle,
          null
        ));
      if (!squareOrderResponse.success) {
        logger.error(`Failed to create order: ${JSON.stringify(squareOrderResponse.error)}`);
        squareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }))
        throw errors;
      }

      squareOrder = squareOrderResponse.result.order!;
      squareOrderVersion = squareOrder!.version!;
      logger.info(`For internal id ${referenceId} created Square Order ID: ${squareOrder.id!}`);

      // Payment Part C: process payments with payment processor IN ORDER
      // because it needs to be in order, we can't use Promise.all or map
      for (let pIndex = 0; pIndex < recomputedTotals.paymentsApplied.length; ++pIndex) {
        const payment = recomputedTotals.paymentsApplied[pIndex] as OrderPaymentProposed;
        switch (payment.t) {
          case PaymentMethod.CreditCard: {
            const squarePaymentResponse = await SquareProviderInstance.CreatePayment({
              locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
              sourceId: payment.payment.sourceId,
              amount: payment.amount,
              tipAmount: payment.tipAmount,
              referenceId: referenceId,
              squareOrderId: squareOrder!.id!,
              autocomplete: false
            });
            squareOrderVersion += 1;
            if (squarePaymentResponse.success !== true) {
              const errorDetail = `Failed to process payment: ${JSON.stringify(squarePaymentResponse)}`;
              logger.error(errorDetail);
              squarePaymentResponse.error.forEach(e => (errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" })));
              throw errors;
            }
            logger.info(`For internal id ${referenceId} and Square Order ID: ${squareOrder!.id!} payment for ${MoneyToDisplayString(squarePaymentResponse.result.amount, true)} successful.`)
            sentPayments.push(squarePaymentResponse.result);
            break;
          }
          case PaymentMethod.StoreCredit: {
            const response = await StoreCreditProviderInstance.ValidateLockAndSpend({ code: payment.payment.code, amount: payment.amount, lock: payment.payment.lock, updatedBy: STORE_NAME })
            if (!response.success) {
              errors.push({ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: "Unable to debit store credit." });
              throw errors;
            }
            storeCreditResponses.push(response);
            const squareMoneyCreditPaymentResponse = await SquareProviderInstance.CreatePayment({
              locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
              sourceId: "EXTERNAL",
              storeCreditPayment: payment,
              amount: payment.amount,
              tipAmount: payment.tipAmount,
              referenceId: payment.payment.code,
              squareOrderId: squareOrder!.id!,
              autocomplete: false
            });
            squareOrderVersion += 1;
            if (squareMoneyCreditPaymentResponse.success !== true) {
              const errorDetail = `Failed to process payment: ${JSON.stringify(squareMoneyCreditPaymentResponse)}`;
              logger.error(errorDetail);
              squareMoneyCreditPaymentResponse.error.forEach(e => (errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" })));
              throw errors;
            }
            logger.info(`For internal id ${referenceId} and Square Order ID: ${squareOrder!.id!} payment for ${MoneyToDisplayString(squareMoneyCreditPaymentResponse.result.amount, true)} successful.`)
            sentPayments.push(squareMoneyCreditPaymentResponse.result);
            break;
          }
        }
      }

      // THE GOAL YALL
      const completedOrderInstance: Omit<WOrderInstance, 'id' | 'metadata'> = {
        ...orderInstance,
        payments: sentPayments.slice(),
        discounts: discounts.slice(),
        refunds: [],
        taxes: [{ amount: recomputedTotals.taxAmount }],
        status: WOrderStatus.OPEN,
        locked: null
      };
      // 6. create calendar event
      try {
        const calendarEvent = await GoogleProviderInstance.CreateCalendarEvent(GenerateOrderEventJson(
          shorthandEventTitle,
          completedOrderInstance,
          rebuiltCart,
          dateTimeInterval,
          recomputedTotals));

        const savedOrder = (await new WOrderInstanceModel({
          ...completedOrderInstance,
          metadata: [
            { key: 'SQORDER', value: squareOrder!.id! },
            { key: 'GCALEVENT', value: calendarEvent.data.id }]
        }).save()).toObject();
        logger.info(`Successfully saved OrderInstance to database: ${JSON.stringify(savedOrder)}`)

        // send email to customer
        const createExternalEmailInfo = CreateExternalEmail(
          savedOrder,
          service_title,
          rebuiltCart);

        SocketIoProviderInstance.EmitOrder(savedOrder);
        
        // success!
        return { status: 200, success: true, result: savedOrder };

      } catch (error: any) {
        const errorDetail = `Caught error while saving calendary entry: ${JSON.stringify(error)}`;
        logger.error(errorDetail);
        errors.push({ category: "INTERNAL_SERVER_ERROR", code: "INTERNAL_SERVER_ERROR", detail: errorDetail });
        throw errors;
      }
    } catch (err: any) {
      // pass
    }

    // Payment Appendix: if we're here, then we didn't charge the order and we need to back it out.
    try {
      if (squareOrder !== null) {
        SquareProviderInstance.OrderStateChange(
          DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
          squareOrder.id!,
          squareOrderVersion,
          "CANCELED");
      }
      await RefundSquarePayments(sentPayments, 'Refunding failed order');
      await CancelSquarePayments(sentPayments);
      await RefundStoreCreditDebits(storeCreditResponses);
    }
    catch (err: any) {
      logger.error(`Got error when unwinding the order after failure: ${JSON.stringify(err)}`);
      return { status: 500, success: false, error: errors };
    }
    return { status: 400, success: false, error: errors };
  };

  Bootstrap = async () => {
    logger.info("Order Manager Bootstrap");

    const _SEND_ORDER_INTERVAL = setInterval(() => {
      this.SendOrders();
    }, 60000);

    const _CLEAR_OLD_ORDERS_INTERVAL = setInterval(() => {
      this.ClearPastOrders();
    }, 1000 * 60 * 60 * 24); // every 24 hours

    if (DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P) {
      const _QUERY_3P_ORDERS = setInterval(() => {
        this.Query3pOrders();
      }, 35000);
      logger.info(`Set job to query for 3rd Party orders at square location: ${DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P}.`);
    } else {
      logger.warn("No value set for SQUARE_LOCATION_3P, skipping polling for 3p orders.");
    }
    logger.info("Order Manager Bootstrap completed.");
  };
}

export const OrderManagerInstance = new OrderManager();
