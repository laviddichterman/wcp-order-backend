import {
  CanThisBeOrderedAtThisTimeAndFulfillment,
  ComputeCartSubTotal,
  CategorizedRebuiltCart,
  WProduct,
  WCPProductV2Dto,
  CreateOrderRequestV2,
  FulfillmentDto,
  DeliveryInfoDto,
  CoreCartEntry,
  ComputeTaxAmount,
  ComputeTipBasis,
  ComputeTipValue,
  ComputeTotal,
  ComputeBalanceAfterCredits,
  JSFECreditV2,
  CrudOrderResponse,
  WDateUtils,
  GenerateMenu,
  IMenu,
  ComputeSubtotalPreDiscount,
  ComputeSubtotalAfterDiscount,
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
  IMoney,
  DateTimeIntervalBuilder,
  ComputeMainProductCategoryCount,
  ComputeCreditsApplied,
  StoreCreditType,
  StoreCreditPayment,
  WOrderStatus,
  FulfillmentTime,
  FulfillmentType,
  RebuildAndSortCart,
  ResponseWithStatusCode,
  ResponseSuccess,
  WFulfillmentStatus,
  CustomerInfoDto,
  EventTitleStringBuilder,
  GenerateDineInPlusString
} from "@wcp/wcpshared";

import { WProvider } from '../types/WProvider';

import { formatRFC3339, format, Interval, isSameMinute, formatISO, addHours, isSameDay, subHours, subMinutes, parseISO } from 'date-fns';
import { GoogleProviderInstance } from "./google";
import { SquareProviderInstance } from "./square";
import { StoreCreditProviderInstance } from "./store_credit_provider";
import { CatalogProviderInstance } from './catalog_provider';
import { DataProviderInstance } from './dataprovider';
import logger from '../logging';
import crypto from 'crypto';
import { OrderFunctional } from "@wcp/wcpshared";
import { WOrderInstanceModel } from "../models/orders/WOrderInstance";
import { CatalogObject, Order as SquareOrder } from "square";
import { SocketIoProviderInstance } from "./socketio_provider";
import { CreateOrderFromCart, CreateOrderForMessages, CreateOrdersForPrintingFromCart, CartByPrinterGroup, GetSquareIdFromExternalIds, BigIntMoneyToIntMoney, LineItemsToOrderInstanceCart } from "./SquareWarioBridge";
import { FilterQuery } from "mongoose";
import { WOrderInstanceFunctionModel } from "../models/query/order/WOrderInstanceFunction";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
type CrudFunctionResponseWithStatusCode = (order: WOrderInstance) => ResponseWithStatusCode<CrudOrderResponse>;
const WCP = "Windy City Pie";

const IL_AREA_CODES = ["217", "309", "312", "630", "331", "618", "708", "773", "815", "779", "847", "224", "872"];
const MI_AREA_CODES = ["231", "248", "269", "313", "517", "586", "616", "734", "810", "906", "947", "989", "679"];

const BTP_AREA_CODES = IL_AREA_CODES.concat(MI_AREA_CODES);
const WCP_AREA_CODES = IL_AREA_CODES;

/**
 * order transitions to check
 * new order -> cancel
 * new order -> reschedule (within 5 hrs) -> cancel
 * new order -> reschedule (within 5 hrs) -> confirm -> reschedule -> cancel
 * new order (tomorrow) -> reschedule (within 5 hrs) -> confirm -> cancel 
 * new order (w/in 5 hrs) -> confirm -> cancel 
 */

interface RecomputeTotalsArgs {
  order: WOrderInstancePartial;
  cart: CategorizedRebuiltCart;
  creditValidations: JSFECreditV2[];
  fulfillment: FulfillmentConfig;
}

export interface RecomputeTotalsResult {
  mainCategoryProductCount: number;
  cartSubtotal: IMoney;
  serviceFee: IMoney;
  subtotalPreDiscount: IMoney;
  subtotalAfterDiscount: IMoney;
  discountApplied: JSFECreditV2[];
  taxAmount: IMoney;
  tipBasis: IMoney;
  tipMinimum: IMoney;
  total: IMoney;
  giftCartApplied: JSFECreditV2[];
  balanceAfterCredits: IMoney;
  tipAmount: IMoney;
  hasBankersRoundingTaxSkew: boolean;
}

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
      return `Received payment of ${MoneyToDisplayString(payment.amount, true)} from credit card ending in ${payment.payment.last4}.
      ${lineBreak}
      ${payment.payment.receiptUrl ?
          (isHtml ?
            `<a href="${payment.payment.receiptUrl}">Receipt link</a>${lineBreak}` :
            `Receipt: ${payment.payment.receiptUrl}${lineBreak}`) :
          ""}`;
    case PaymentMethod.StoreCredit:
      return `Applied store credit value ${MoneyToDisplayString(payment.amount, true)} using code ${payment.payment.code}.${lineBreak}`;
  }
}

function GenerateOrderLineDiscountDisplay(discount: OrderLineDiscount, isHtml: boolean) {
  switch (discount.t) {
    case DiscountMethod.CreditCodeAmount:
      return `NOTE BEFORE CLOSING OUT: Apply discount of ${MoneyToDisplayString(discount.discount.amount, true)}, pre-tax. Credit code used: ${discount.discount.code}.${isHtml ? "<br />" : "\n"}`;
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


const GenerateShortCartFromFullCart = (cart: CategorizedRebuiltCart): { category_name: string; products: string[] }[] => {
  const catalogCategories = CatalogProviderInstance.Catalog.categories;
  return Object.entries(cart)
    .filter(([_, cart]) => cart.length > 0)
    .map(([catid, category_cart]) => {
      const category_name = catalogCategories[catid].category.name;
      const category_shortcart = { category_name: category_name, products: category_cart.map(x => `${x.quantity}x: ${x.product.m.shortname}`) };
      return category_shortcart;
    })
}

const RebuildOrderState = function (menu: IMenu, cart: CoreCartEntry<WCPProductV2Dto>[], service_time: Date | number, fulfillmentId: string) {
  const catalogSelectors = CatalogProviderInstance.CatalogSelectors;
  const rebuiltCart = RebuildAndSortCart(cart, catalogSelectors, service_time, fulfillmentId);
  const noLongerAvailable: CoreCartEntry<WProduct>[] = Object.values(rebuiltCart).flatMap(entries => entries.filter(x => !CanThisBeOrderedAtThisTimeAndFulfillment(x.product.p, menu, catalogSelectors, service_time, fulfillmentId) ||
    !catalogSelectors.category(x.categoryId)))
  return {
    noLongerAvailable,
    rebuiltCart
  };
}

const RecomputeTotals = function ({ cart, creditValidations, fulfillment, order }: RecomputeTotalsArgs): RecomputeTotalsResult {
  const TAX_RATE = DataProviderInstance.Settings.config.TAX_RATE as number;
  const AUTOGRAT_THRESHOLD = DataProviderInstance.Settings.config.AUTOGRAT_THRESHOLD as number ?? 5;

  const mainCategoryProductCount = ComputeMainProductCategoryCount(fulfillment.orderBaseCategoryId, order.cart);
  const cartSubtotal = { currency: CURRENCY.USD, amount: Object.values(cart).reduce((acc, c) => acc + ComputeCartSubTotal(c).amount, 0) };
  const serviceFee = { currency: CURRENCY.USD, amount: fulfillment.serviceCharge !== null ? OrderFunctional.ProcessOrderInstanceFunction(order, CatalogProviderInstance.Catalog.orderInstanceFunctions[fulfillment.serviceCharge], CatalogProviderInstance.CatalogSelectors) as number : 0 };
  const subtotalPreDiscount = ComputeSubtotalPreDiscount(cartSubtotal, serviceFee);
  const discountApplied = ComputeCreditsApplied(subtotalPreDiscount, creditValidations.filter(x => x.validation.credit_type === StoreCreditType.DISCOUNT));
  const amountDiscounted = { amount: discountApplied.reduce((acc, x) => acc + x.amount_used.amount, 0), currency: CURRENCY.USD };
  const subtotalAfterDiscount = ComputeSubtotalAfterDiscount(subtotalPreDiscount, amountDiscounted);
  const taxAmount = ComputeTaxAmount(subtotalAfterDiscount, TAX_RATE);
  const hasBankersRoundingTaxSkew = (subtotalAfterDiscount.amount * TAX_RATE) % 1 === 0.5;
  const tipBasis = ComputeTipBasis(subtotalPreDiscount, taxAmount);
  const tipMinimum = mainCategoryProductCount >= AUTOGRAT_THRESHOLD ? ComputeTipValue({ isPercentage: true, isSuggestion: true, value: .2 }, tipBasis) : { currency: CURRENCY.USD, amount: 0 };
  const tipAmount = ComputeTipValue(order.tip, tipBasis);
  const total = ComputeTotal(subtotalAfterDiscount, taxAmount, tipAmount);
  const giftCartApplied = ComputeCreditsApplied(total, creditValidations.filter(x => x.validation.credit_type === StoreCreditType.MONEY));
  const amountCredited = { amount: giftCartApplied.reduce((acc, x) => acc + x.amount_used.amount, 0), currency: CURRENCY.USD };
  const balanceAfterCredits = ComputeBalanceAfterCredits(total, amountCredited);
  return {
    mainCategoryProductCount,
    cartSubtotal,
    serviceFee,
    subtotalPreDiscount,
    subtotalAfterDiscount,
    discountApplied,
    taxAmount,
    tipBasis,
    tipMinimum,
    total,
    giftCartApplied,
    balanceAfterCredits,
    tipAmount,
    hasBankersRoundingTaxSkew
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
  const cartstring = GenerateDisplayCartStringListFromProducts(cart);
  const paymentDisplays = order.payments.map(payment => GenerateOrderPaymentDisplay(payment, true)).join("<br />");
  const delivery_section = order.fulfillment.deliveryInfo ? GenerateDeliverySection(order.fulfillment.deliveryInfo, true) : "";
  const location_section = delivery_section ? "" : `<p><strong>Location Information:</strong>
We are located ${LOCATION_INFO}</p>`;
  const special_instructions_section = order.specialInstructions && order.specialInstructions.length > 0 ? `<p><strong>Special Instructions</strong>: ${order.specialInstructions} </p>` : "";
  const emailbody = `<p>${ORDER_RESPONSE_PREAMBLE}</p>
<p>We take your health seriously; be assured your order has been prepared with the utmost care.</p>
<p>Note that all gratuity is shared with the entire ${STORE_NAME} family.</p>
<p>Please take some time to ensure the details of your order as they were entered are correct. If the order is fine, there is no need to respond to this message. If you need to make a correction or have a question, please respond to this message as soon as possible.</p>
    
<b>Order information:</b><br />
Service: ${service_title}.<br />
Phone: ${order.customerInfo.mobileNum}<br />
Order contents:<br />
${cartstring.join("<br />")}
${special_instructions_section ? '<br />' : ''}${special_instructions_section}
${delivery_section ? '<br />' : ''}${delivery_section}
${paymentDisplays ? '<br />' : ''}${paymentDisplays}
${location_section ? '<br />' : ''}${location_section}We thank you for your support!`;
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

const CreateOrderEvent = async (
  shorthandEventTitle: string,
  order: Pick<WOrderInstance, 'customerInfo' | 'fulfillment' | 'payments' | 'discounts' | 'specialInstructions'>,
  cart: CategorizedRebuiltCart,
  service_time_interval: Interval,
  totals: RecomputeTotalsResult) => {
  const shortcart = GenerateShortCartFromFullCart(cart);
  const special_instructions_section = order.specialInstructions && order.specialInstructions.length > 0 ? `\nSpecial Instructions: ${order.specialInstructions}` : "";
  const payment_section = "\n" + GeneratePaymentSection(totals, order.discounts, order.payments, false);
  const delivery_section = order.fulfillment.deliveryInfo ? GenerateDeliverySection(order.fulfillment.deliveryInfo, false) : "";
  const dineInSection = order.fulfillment.dineInInfo ? GenerateDineInSection(order.fulfillment.dineInInfo, false) : "";
  const calendar_details =
    `${shortcart.map((x) => `${x.category_name}:\n${x.products.join("\n")}`).join("\n")}
${dineInSection}
ph: ${order.customerInfo.mobileNum}
${special_instructions_section}${delivery_section}${payment_section}`;

  return await GoogleProviderInstance.CreateCalendarEvent({
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
  });
}

async function RefundStoreCreditDebits(spends: ValidateLockAndSpendSuccess[]) {
  return Promise.all(spends.map(async (x) => {
    logger.info(`Refunding ${JSON.stringify(x.entry)} after failed processing.`);
    return StoreCreditProviderInstance.CheckAndRefundStoreCredit(x.entry, x.index);
  }))
}

async function RefundSquarePayments(payments: OrderPayment[], reason: string) {
  return Promise.all(payments
    .filter(x => x.status === TenderBaseStatus.COMPLETED)
    .map(x => SquareProviderInstance.RefundPayment(x.payment.processorId, x.amount, reason)));
}

async function CancelSquarePayments(payments: OrderPayment[]) {
  return Promise.all(payments
    .filter(x => x.status === TenderBaseStatus.AUTHORIZED)
    .map(x => SquareProviderInstance.CancelPayment(x.payment.processorId)));
}

const GetEndOfSendingRange = (now: Date | number): Date => {
  return addHours(now, 3);
}

export class OrderManager implements WProvider {
  constructor() {
  }

  private Query3pOrders = async () => {
    const timeSpanAgo = zonedTimeToUtc(subHours(Date.now(), 2), process.env.TZ!)
    logger.info(`timeSpanAgo formatted: ${formatRFC3339(timeSpanAgo)}`);
    const recentlyUpdatedOrdersResponse = await SquareProviderInstance.SearchOrders([DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P], {
      filter: { dateTimeFilter: { updatedAt: { startAt: formatRFC3339(timeSpanAgo) } } }, sort: { sortField: 'UPDATED_AT', sortOrder: 'ASC' }
    });
    if (recentlyUpdatedOrdersResponse.success) {
      const ordersToInspect = (recentlyUpdatedOrdersResponse.result.orders ?? []).filter(x => x.lineItems && x.lineItems.length > 0 && x.fulfillments?.length === 1);
      const squareOrderIds = ordersToInspect.map(x => x.id!);
      const found3pOrders = await WOrderInstanceModel.find({ 'fulfillment.thirdPartyInfo.squareId': { $in: squareOrderIds } }).exec();
      const ordersToIngest = ordersToInspect.filter(x => found3pOrders.findIndex(order => order.fulfillment.thirdPartyInfo!.squareId === x.id!) === -1);
      const orderInstances = ordersToIngest.map(squareOrder => {
        const fulfillmentDetails = squareOrder.fulfillments![0];
        const fulfillmentTime = WDateUtils.ComputeFulfillmentTime(utcToZonedTime(fulfillmentDetails.pickupDetails!.pickupAt!, process.env.TZ!));
        const [givenName, familyFirstLetter] = (fulfillmentDetails.pickupDetails?.recipient?.displayName ?? "ABBIE NORMAL").split(' ');
        return new WOrderInstanceModel({
          customerInfo: {
            email: DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS,
            givenName,
            familyName: familyFirstLetter,
            mobileNum: fulfillmentDetails.pickupDetails?.recipient?.phoneNumber ?? "2064864743",
            referral: ""
          },
          discounts: [],
          fulfillment: {
            ...fulfillmentTime,
            selectedService: DataProviderInstance.KeyValueConfig.THIRD_PARTY_FULFILLMENT,
            status: WFulfillmentStatus.PROPOSED,
            thirdPartyInfo: { squareId: squareOrder.id! },
          },
          locked: null,
          metadata: [{ key: 'SQORDER', value: squareOrder.id! }],
          payments: squareOrder.tenders?.map((x): OrderPayment => ({ t: PaymentMethod.Cash, amount: BigIntMoneyToIntMoney(x.amountMoney!), createdAt: Date.now(), status: TenderBaseStatus.COMPLETED, tipAmount: { amount: 0, currency: CURRENCY.USD }, payment: { amountTendered: BigIntMoneyToIntMoney(x.amountMoney!), change: { amount: 0, currency: CURRENCY.USD }, processorId: x.paymentId! } })) ?? [],
          refunds: [],
          tip: { isPercentage: false, isSuggestion: false, value: { amount: 0, currency: CURRENCY.USD } },
          taxes: squareOrder.taxes?.map((x => ({ amount: BigIntMoneyToIntMoney(x.appliedMoney!) }))) ?? [],
          status: WOrderStatus.OPEN,
          cart: LineItemsToOrderInstanceCart(squareOrder.lineItems!)
        })
      });
      if (orderInstances.length > 0) {
        await WOrderInstanceModel.bulkSave(orderInstances);
      }
    }

  }

  /**
   * Finds UNLOCKED orders due within the next 3 hours with proposed fulfillment status and sends them, setting the fulfillment status to SENT
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
                await this.SendLockedOrder(lockedOrders[i], true);
              }
            })
        }
      })
  }

  public GetOrder = async (orderId: string): Promise<WOrderInstance | null> => {
    // find order and return
    return await WOrderInstanceModel.findById(orderId);
  };

  public GetOrders = async (queryDate: string | null, queryStatus: WOrderStatus | null): Promise<WOrderInstance[]> => {
    // find orders and return
    const dateConstraint = queryDate ? { 'fulfillment.selectedDate': queryDate } : {};
    const statusConstraint = queryStatus ? { 'status': queryStatus } : {};
    return await WOrderInstanceModel.find({
      ...(dateConstraint),
      ...(statusConstraint)
    }).exec();
  };

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

  public DiscountOrder = async (idempotencyKey: string, orderId: string, reason: string) => {
    // TODO
  }

  public ObliterateLocks = async () => {
    await WOrderInstanceModel.updateMany({}, { locked: null });
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
      const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment.dineInInfo ?? null, rebuiltCart, lockedOrder.specialInstructions ?? "")
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
      for (let i = 0; i < messageOrders.length; ++i) {
        await SquareProviderInstance.SendMessageOrder(messageOrders[i])
      }
      if (releaseLock) {
        // update order in DB, release lock
        return await WOrderInstanceModel.findOneAndUpdate(
          { locked: lockedOrder.locked, _id: lockedOrder.id },
          {
            locked: null,
            'fulfillment.status': WFulfillmentStatus.SENT
          },
          { new: true })
          .then(async (updatedOrder): Promise<ResponseWithStatusCode<ResponseSuccess<WOrderInstance>>> => {
            return { success: true, status: 200, result: updatedOrder! };
          })
          .catch((err: any) => {
            throw err;
          })
      }
      return { success: true, status: 200, result: lockedOrder };
    } catch (error: any) {
      const errorDetail = `Caught error when attempting to send order: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`;
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

  public SendOrder = async (idempotencyKey: string, orderId: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    return await this.LockAndActOnOrder(idempotencyKey, orderId,
      { status: { $nin: [WOrderStatus.CANCELED] } },
      (o) => this.SendLockedOrder(o, true)
    );
  }

  private CancelLockedOrder = async (lockedOrder: WOrderInstance, reason: string, emailCustomer: boolean): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    logger.debug(`Found order to cancel: ${JSON.stringify(lockedOrder, null, 2)}, lock applied.`);
    const errors: WError[] = [];
    try {
      const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
      const is3pOrder = fulfillmentConfig.service === FulfillmentType.ThirdParty;
      const squareOrderId = lockedOrder.metadata.find(x => x.key === 'SQORDER')!.value;

      if (!is3pOrder) {
        // refund store credits
        const discountCreditRefunds = lockedOrder.discounts.map(async (discount) => {
          return StoreCreditProviderInstance.RefundStoreCredit(discount.discount.code, discount.discount.amount, 'WARIO');
        });
      }

      // lookup Square Order for payments and version number
      const retrieveSquareOrderResponse = await SquareProviderInstance.RetrieveOrder(squareOrderId);
      if (!retrieveSquareOrderResponse.success) {
        // unable to find the order
        retrieveSquareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }));
        return { status: 404, success: false, error: errors };
      }

      let orderVersion = retrieveSquareOrderResponse.result.order!.version!;

      // refund square payments
      const paymentRefunds = lockedOrder.payments.map(async (payment) => {
        if (payment.t === PaymentMethod.StoreCredit) {
          // refund the credit in the store credit DB
          StoreCreditProviderInstance.RefundStoreCredit(payment.payment.code, payment.amount, 'WARIO');
        }
        let undoPaymentResponse;
        if (lockedOrder.status === WOrderStatus.CONFIRMED) {
          undoPaymentResponse = await SquareProviderInstance.RefundPayment(payment.payment.processorId, payment.amount, reason);
          orderVersion += 2;
        } else {
          undoPaymentResponse = await SquareProviderInstance.CancelPayment(payment.payment.processorId);
          orderVersion += 1;
        }
        if (!undoPaymentResponse.success) {
          const errorDetail = `Failed to process payment refund for payment ID: ${payment.payment.processorId}`;
          logger.error(errorDetail);
          undoPaymentResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }));
        }
        return undoPaymentResponse;
      });
      // TODO: check refund statuses

      // * send message on cancelation to relevant printer groups
      // do this here to give the refunds time to process, which hopefully results in the +2 increment in the order version
      if (lockedOrder.fulfillment.status === WFulfillmentStatus.SENT || lockedOrder.fulfillment.status === WFulfillmentStatus.PROCESSING) {
        const promisedTime = DateTimeIntervalBuilder(lockedOrder.fulfillment, fulfillmentConfig);
        const oldPromisedTime = WDateUtils.ComputeServiceDateTime(lockedOrder.fulfillment);
        const customerName = `${lockedOrder.customerInfo.givenName} ${lockedOrder.customerInfo.familyName}`;
        const rebuiltCart = RebuildAndSortCart(lockedOrder.cart, CatalogProviderInstance.CatalogSelectors, promisedTime.start, fulfillmentConfig.id);
        const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment.dineInInfo ?? null, rebuiltCart, lockedOrder.specialInstructions ?? "")
        const flatCart = Object.values(rebuiltCart).flat();
        // get mapping from printerGroupId to list CoreCartEntry<WProduct> being adjusted for that pgId
        const messages = Object.entries(CartByPrinterGroup(flatCart)).map(([pgId, entries]) => ({
          squareItemVariationId: GetSquareIdFromExternalIds(CatalogProviderInstance.PrinterGroups[pgId]!.externalIDs, 'ITEM_VARIATION')!,
          message: entries.map(x => `${x.quantity}x:${x.product.m.shortname}`)
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
        await SquareProviderInstance.SendMessageOrder(messageOrder);
      }

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
          'fulfillment.status': WFulfillmentStatus.CANCELED
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

  public CancelOrder = async (idempotencyKey: string, orderId: string, reason: string, emailCustomer: boolean): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    return await this.LockAndActOnOrder(idempotencyKey, orderId,
      { status: { $in: [WOrderStatus.OPEN, WOrderStatus.CONFIRMED] } },
      (o) => this.CancelLockedOrder(o, reason, emailCustomer)
    );
  }

  /**
   * 
   * @param lockedOrder Order in OPEN or CONFIRMED state, with fulfillment in PROPOSED or SENT state
   * @param newTime 
   * @param emailCustomer 
   * @returns 
   */
  private AdjustLockedOrderTime = async (lockedOrder: WOrderInstance, newTime: FulfillmentTime, emailCustomer: boolean, additionalMessage: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
    const is3pOrder = fulfillmentConfig.service === FulfillmentType.ThirdParty;
    const promisedTime = DateTimeIntervalBuilder(lockedOrder.fulfillment, fulfillmentConfig);
    const oldPromisedTime = WDateUtils.ComputeServiceDateTime(lockedOrder.fulfillment);
    logger.info(`Adjusting order in status: ${lockedOrder.status} with fulfillment status ${lockedOrder.fulfillment.status} to new time of ${format(promisedTime.start, WDateUtils.ISODateTimeNoOffset)}`);
    const customerName = `${lockedOrder.customerInfo.givenName} ${lockedOrder.customerInfo.familyName}`;
    const rebuiltCart = RebuildAndSortCart(lockedOrder.cart, CatalogProviderInstance.CatalogSelectors, promisedTime.start, fulfillmentConfig.id);
    const eventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, lockedOrder.fulfillment.dineInInfo ?? null, rebuiltCart, lockedOrder.specialInstructions ?? "")
    const flatCart = Object.values(rebuiltCart).flat();
    // if the order has SENT fulfillment, we need to notify all relevant printer groups of the new time
    if (lockedOrder.fulfillment.status === WFulfillmentStatus.SENT) {
      // get mapping from printerGroupId to list CoreCartEntry<WProduct> being adjusted for that pgId
      const messages = Object.entries(CartByPrinterGroup(flatCart)).map(([pgId, entries]) => ({
        squareItemVariationId: GetSquareIdFromExternalIds(CatalogProviderInstance.PrinterGroups[pgId]!.externalIDs, 'ITEM_VARIATION')!,
        message: entries.map(x => `${x.quantity}x:${x.product.m.shortname}`)
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
      await SquareProviderInstance.SendMessageOrder(messageOrder);
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
      await CreateExternalEmailForOrderReschedule(fulfillmentConfig, { ...lockedOrder.fulfillment, ...newTime }, lockedOrder.customerInfo, additionalMessage);
    }

    // adjust DB event
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: lockedOrder.locked, _id: lockedOrder.id },
      {
        locked: null,
        'fulfillment.selectedDate': newTime.selectedDate,
        'fulfillment.selectedTime': newTime.selectedTime,
        'fulfillment.status': WFulfillmentStatus.PROPOSED,
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
  public ConfirmLockedOrder = async (lockedOrder: WOrderInstance, messageToCustomer: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
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

    // TODO: check if the order is within time range and send it if so
    // GetEndOfSendingRange

    // adjust DB event
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: lockedOrder.locked, _id: lockedOrder.id },
      { locked: null, status: WOrderStatus.CONFIRMED }, // TODO: payments status need to be changed as committed to the DB if not 3p
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
  };

  public CreateOrder = async (createOrderRequest: CreateOrderRequestV2, ipAddress: string): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
    const requestTime = Date.now();

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

    const shorthandEventTitle = EventTitleStringBuilder(CatalogProviderInstance.CatalogSelectors, fulfillmentConfig, customerName, createOrderRequest.fulfillment.dineInInfo ?? null, rebuiltCart, createOrderRequest.specialInstructions ?? "");

    // 3. 'let's setup the order object reference
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
      metrics: createOrderRequest.metrics,
      tip: createOrderRequest.tip,
      specialInstructions: createOrderRequest.specialInstructions
    }

    // 3. recompute the totals to ensure everything matches up, and to get some needed computations that we don't want to pass over the wire and blindly trust
    const recomputedTotals = RecomputeTotals({ cart: rebuiltCart, creditValidations: createOrderRequest.creditValidations, fulfillment: fulfillmentConfig, order: orderInstance });
    if (createOrderRequest.balance.amount !== recomputedTotals.balanceAfterCredits.amount) {
      const errorDetail = `Computed different balance of ${MoneyToDisplayString(recomputedTotals.balanceAfterCredits, true)} vs sent: ${MoneyToDisplayString(createOrderRequest.balance, true)}`;
      logger.error(errorDetail)
      return {
        status: 500,
        success: false,
        error: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: errorDetail }]
      };
    }
    if (recomputedTotals.balanceAfterCredits.amount > 0 && !createOrderRequest.nonce) {
      const errorDetail = 'Order balance is non-zero and no payment method provided.';
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
    const availabilityMap = WDateUtils.GetInfoMapForAvailabilityComputation([DataProviderInstance.Fulfillments[createOrderRequest.fulfillment.selectedService]], createOrderRequest.fulfillment.selectedDate, { cart_based_lead_time: 0, size: recomputedTotals.mainCategoryProductCount });
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

    // 5. enter payment subsection
    let tipAmountRemaining = recomputedTotals.tipAmount.amount;
    const discounts: OrderLineDiscount[] = [];
    const moneyCreditPayments: StoreCreditPayment[] = [];

    // Payment part A: attempt to process store credits, keep track of old store credit balance in case of failure
    const storeCreditResponses: ValidateLockAndSpendSuccess[] = [];
    let creditProcessingFailed = false;
    try {
      await Promise.all(createOrderRequest.creditValidations.map(async (creditUse) => {
        // NOTE: we assume validation of the amount_used field in the RecomputeTotals method
        if (creditUse.amount_used.amount > 0) {
          const response = await StoreCreditProviderInstance.ValidateLockAndSpend({ code: creditUse.code, amount: creditUse.amount_used, lock: creditUse.validation.lock, updatedBy: STORE_NAME })
          if (response.success) {
            storeCreditResponses.push(response);
            switch (creditUse.validation.credit_type) {
              case 'DISCOUNT':
                discounts.push({
                  status: TenderBaseStatus.COMPLETED,
                  t: DiscountMethod.CreditCodeAmount,
                  createdAt: Date.now(),
                  discount: {
                    amount: creditUse.amount_used,
                    code: creditUse.code,
                    lock: creditUse.validation.lock
                  }
                });
                break;
              case 'MONEY':
                const tipAmountToApply = Math.min(tipAmountRemaining, creditUse.amount_used.amount);
                tipAmountRemaining -= tipAmountToApply;
                moneyCreditPayments.push({
                  tipAmount: { currency: recomputedTotals.tipAmount.currency, amount: tipAmountToApply },
                  status: TenderBaseStatus.COMPLETED,
                  t: PaymentMethod.StoreCredit,
                  createdAt: Date.now(),
                  amount: creditUse.amount_used,
                  payment: {
                    processorId: "", // empty until we run it past square
                    code: creditUse.code,
                    lock: creditUse.validation.lock
                  }
                });
                break;
            }
            return;
          }
        }
        throw `Failed processing ${JSON.stringify(creditUse)}`;
      }));
    } catch (err) {
      creditProcessingFailed = true;
    }

    if (creditProcessingFailed) {
      // unwind storeCreditResponses
      await RefundStoreCreditDebits(storeCreditResponses);
      logger.error("Failed to process store credit step of ordering");
      return { status: 404, success: false, error: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: "Unable to debit store credit." }] };
    }

    const orderInstanceBeforeCharging: Omit<WOrderInstance, 'id' | 'metadata' | 'status' | 'locked'> = {
      ...orderInstance,
      taxes: [{ amount: recomputedTotals.taxAmount }],
      refunds: [],
      payments: moneyCreditPayments.slice(),
      discounts: discounts.slice()
    };

    // Payment Part B: we've processed any credits, make an order
    let errors: WError[] = [];
    let squareOrder: SquareOrder | null = null;
    let squareOrderVersion = 0;
    const squarePayments: OrderPayment[] = [];
    try {
      const squareOrderResponse = await SquareProviderInstance.CreateOrder(
        CreateOrderFromCart(
          DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
          referenceId,
          orderInstanceBeforeCharging.discounts, orderInstanceBeforeCharging.taxes,
          Object.values(rebuiltCart).flat(),
          recomputedTotals.hasBankersRoundingTaxSkew,
          shorthandEventTitle,
          null
        ));
      if (squareOrderResponse.success === true) {
        squareOrder = squareOrderResponse.result.order!;
        const squareOrderId = squareOrder!.id!;
        squareOrderVersion = squareOrder!.version!;
        logger.info(`For internal id ${referenceId} created Square Order ID: ${squareOrderId}`);
        // Payment Part C: create payments
        //  substep i: close out the order via credit card payment or if no money credit payments either, a 0 cash money payment, 
        if (recomputedTotals.balanceAfterCredits.amount > 0 || moneyCreditPayments.length === 0) {
          const squarePaymentResponse = await SquareProviderInstance.CreatePayment({
            locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, // TODO: is this the right location?
            sourceId: recomputedTotals.balanceAfterCredits.amount > 0 ? createOrderRequest.nonce! : 'CASH',
            amount: recomputedTotals.balanceAfterCredits,
            tipAmount: { currency: recomputedTotals.tipAmount.currency, amount: tipAmountRemaining },
            referenceId: referenceId,
            squareOrderId,
            autocomplete: false
          });
          squareOrderVersion += 1;
          if (squarePaymentResponse.success === true) {
            logger.info(`For internal id ${referenceId} and Square Order ID: ${squareOrderId} payment for ${MoneyToDisplayString(squarePaymentResponse.result.amount, true)} successful.`)
            squarePayments.push(squarePaymentResponse.result);
          } else {
            const errorDetail = `Failed to process payment: ${JSON.stringify(squarePaymentResponse)}`;
            logger.error(errorDetail);
            squarePaymentResponse.error.forEach(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }))
            // throw for flow control
            throw errorDetail;
          }
        }
        // Payment Part C, substep ii: process money store credit payments
        await Promise.all(moneyCreditPayments.map(async (payment) => {
          try {
            const squareMoneyCreditPaymentResponse = await SquareProviderInstance.CreatePayment({
              locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION, // IS THIS THE RIGHT LOCATION?
              sourceId: "EXTERNAL",
              storeCreditPayment: payment,
              amount: payment.amount,
              tipAmount: payment.tipAmount,
              referenceId: payment.payment.code,
              squareOrderId,
              autocomplete: false
            });
            squareOrderVersion += 1;
            if (squareMoneyCreditPaymentResponse.success === true) {
              logger.info(`For internal id ${referenceId} and Square Order ID: ${squareOrderId} payment for ${MoneyToDisplayString(squareMoneyCreditPaymentResponse.result.amount, true)} successful.`)
              //this next line duplicates the store credit payments, since we already have them independently processed
              squarePayments.push(squareMoneyCreditPaymentResponse.result);
            } else {
              const errorDetail = `Failed to process payment: ${JSON.stringify(squareMoneyCreditPaymentResponse)}`;
              logger.error(errorDetail);
              squareMoneyCreditPaymentResponse.error.forEach(e => (errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" })));
            }
          }
          catch (err: any) {
            logger.error(`got error in processing money store credit of ${JSON.stringify(payment)} and error: ${JSON.stringify(err)}`);
            throw err;
          }
        }));

        // THE GOAL YALL
        const completedOrderInstance: Omit<WOrderInstance, 'id' | 'metadata'> = {
          ...orderInstanceBeforeCharging,
          payments: squarePayments.slice(),
          discounts: discounts.slice(),
          status: WOrderStatus.OPEN,
          locked: null
        };

        // 6. create calendar event
        try {
          return await CreateOrderEvent(
            shorthandEventTitle,
            completedOrderInstance,
            rebuiltCart,
            dateTimeInterval,
            recomputedTotals)
            .then(async (orderEvent) => {
              return await new WOrderInstanceModel({
                ...completedOrderInstance,
                metadata: [
                  { key: 'SQORDER', value: squareOrderId },
                  { key: 'GCALEVENT', value: orderEvent.data.id }]
              })
                .save()
                .then(async (dbOrderInstance): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
                  logger.info(`Successfully saved OrderInstance to database: ${JSON.stringify(dbOrderInstance.toJSON())}`)
                  // TODO, need to actually test the failure of these service calls and some sort of retrying
                  // for example, the event not created error happens, and it doesn't fail the service call. it should

                  // send email to customer
                  const createExternalEmailInfo = CreateExternalEmail(
                    dbOrderInstance,
                    service_title,
                    rebuiltCart);

                  SocketIoProviderInstance.EmitOrder(dbOrderInstance.toObject());

                  return { status: 200, success: true, result: dbOrderInstance.toObject() };
                })
                .catch(async (error: any) => {
                  logger.error(`Caught error while saving order to database: ${JSON.stringify(error)}`);
                  errors.push({ category: "INTERNAL_SERVER_ERROR", code: "INTERNAL_SERVER_ERROR", detail: "Unable to save order to database" });
                  throw error;
                });
            }).catch(async (error: any) => {
              logger.error(`Caught error while saving calendary entry: ${JSON.stringify(error)}`);
              errors.push({ category: "INTERNAL_SERVER_ERROR", code: "INTERNAL_SERVER_ERROR", detail: "Unable to create order entry" });
              throw error;
            });
        } catch (err) {
          logger.error(JSON.stringify(err));
          // pass, failed in creating the event?
        }
      } else {
        logger.error(`Failed to create order: ${JSON.stringify(squareOrderResponse.error)}`);
        squareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail ?? "" }))
      }
    } catch (err: any) {
      logger.error(JSON.stringify(err));
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
      RefundSquarePayments(squarePayments, 'Refunding failed order');
      CancelSquarePayments(squarePayments);
      RefundStoreCreditDebits(storeCreditResponses);
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
    }, 10000);

    // if (DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P) {
    //   const _QUERY_3P_ORDERS = setInterval(() => {
    //     this.Query3pOrders();
    //   }, 35000);
    //   logger.info(`Set job to query for 3rd Party orders at square location: ${DataProviderInstance.KeyValueConfig.SQUARE_LOCATION_3P}.`);
    // } else {
    //   logger.warn("No value set for SQUARE_LOCATION_3P, skipping polling for 3p orders.");
    // }
    logger.info("Order Manager Bootstrap completed.");
  };


}

export const OrderManagerInstance = new OrderManager();
