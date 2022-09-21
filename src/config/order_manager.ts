import {
  CanThisBeOrderedAtThisTimeAndFulfillment,
  ComputeCartSubTotal,
  CategorizedRebuiltCart,
  PRODUCT_LOCATION,
  WProduct,
  WCPProductV2Dto,
  CreateProductWithMetadataFromV2Dto,
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
  CreateOrderResponse,
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
  CALL_LINE_DISPLAY,
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
  FulfillmentType
} from "@wcp/wcpshared";

import { WProvider } from '../types/WProvider';

import { formatRFC3339, format, Interval, isSameMinute, isSameDay, formatISO, intervalToDuration, formatDuration } from 'date-fns';
import { GoogleProviderInstance } from "./google";
import { SquareProviderInstance } from "./square";
import { StoreCreditProviderInstance } from "./store_credit_provider";
import { CatalogProviderInstance } from './catalog_provider';
import { DataProviderInstance } from './dataprovider';
import logger from '../logging';
import { OrderFunctional } from "@wcp/wcpshared";
import { WOrderInstanceModel } from "../models/orders/WOrderInstance";
import { Order as SquareOrder } from "square";
import { SocketIoProviderInstance } from "./socketio_provider";

const WCP = "Windy City Pie";

const IL_AREA_CODES = ["217", "309", "312", "630", "331", "618", "708", "773", "815", "779", "847", "224", "872"];
const MI_AREA_CODES = ["231", "248", "269", "313", "517", "586", "616", "734", "810", "906", "947", "989", "679"];

const BTP_AREA_CODES = IL_AREA_CODES.concat(MI_AREA_CODES);
const WCP_AREA_CODES = IL_AREA_CODES;

const FormatDurationHelper = function (milliseconds: number) {
  return formatDuration(intervalToDuration({ start: 0, end: milliseconds }));
}


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
}

const GenerateShortCode = function (menu: IMenu, p: WProduct) {
  const pInstances = menu.product_classes[p.p.PRODUCT_CLASS.id].instances;
  return p.m.is_split && String(p.m.pi[PRODUCT_LOCATION.LEFT]) !== String(p.m.pi[PRODUCT_LOCATION.RIGHT]) ?
    `${pInstances[p.m.pi[PRODUCT_LOCATION.LEFT]].shortcode}|${pInstances[p.m.pi[PRODUCT_LOCATION.RIGHT]].shortcode}` :
    pInstances[p.m.pi[PRODUCT_LOCATION.LEFT]].shortcode;
}

const IsNativeAreaCode = function (phone: string, area_codes: string[]) {
  const numeric_phone = phone.match(/\d/g).join("");
  const area_code = numeric_phone.slice(0, 3);
  return (numeric_phone.length == 10 && area_codes.some(x => x === area_code));
};

const DateTimeIntervalToDisplayServiceInterval = (interval: Interval) => {
  return isSameMinute(interval.start, interval.end) ? format(interval.start, WDateUtils.DisplayTimeFormat) : `${format(interval.start, WDateUtils.DisplayTimeFormat)} - ${format(interval.end, WDateUtils.DisplayTimeFormat)}`;
}

const CreateExternalConfirmationEmail = async function (
  order: WOrderInstance,
  isPaid: boolean
) {
  const NOTE_PREPAID = "You've already paid, so unless there's an issue with the order, there's no need to handle payment from this point forward.";
  const NOTE_PAYMENT = "We happily accept any major credit card or cash for payment.";
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const STORE_ADDRESS = DataProviderInstance.KeyValueConfig.STORE_ADDRESS;
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;

  const fulfillmentConfig = DataProviderInstance.Fulfillments[order.fulfillment.selectedService];
  const dateTimeInterval = DateTimeIntervalBuilder(order.fulfillment, fulfillmentConfig);
  const display_time = DateTimeIntervalToDisplayServiceInterval(dateTimeInterval);
  const customer_name = [order.customerInfo.givenName, order.customerInfo.familyName].join(" ");
  const service_title = ServiceTitleBuilder(fulfillmentConfig.displayName, order.fulfillment, customer_name, dateTimeInterval);
  const nice_area_code = IsNativeAreaCode(order.customerInfo.mobileNum, STORE_NAME === WCP ? WCP_AREA_CODES : BTP_AREA_CODES);
  const payment_section = isPaid ? (fulfillmentConfig.service === FulfillmentType.DineIn ? NOTE_PREPAID : NOTE_PREPAID) : NOTE_PAYMENT;
  const confirm = fulfillmentConfig.messages.CONFIRMATION; // [`We're happy to confirm your ${display_time} pickup at`, `We're happy to confirm your ${display_time} at`, `We're happy to confirm your delivery around ${display_time} at`];
  const where = order.fulfillment.deliveryInfo?.validation.validated_address ?? STORE_ADDRESS;

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

const GenerateDeliverySection = (deliveryInfo: DeliveryInfoDto | null, ishtml: boolean) => {
  if (deliveryInfo === null || !deliveryInfo.validation.validated_address) {
    return "";
  }
  const delivery_unit_info = deliveryInfo.address2 ? `, Unit info: ${deliveryInfo.address2}` : "";
  const delivery_instructions = deliveryInfo.deliveryInstructions ? `${ishtml ? "<br />" : "\n"}Delivery Instructions: ${deliveryInfo.deliveryInstructions}` : "";
  return `${ishtml ? "<p><strong>" : "\n"}Delivery Address:${ishtml ? "</strong>" : ""} ${deliveryInfo.validation.validated_address}${delivery_unit_info}${delivery_instructions}${ishtml ? "</p>" : ""}`;
}

const GenerateDineInSection = (dineInInfo: DineInInfoDto | null, ishtml: boolean) => {
  if (dineInInfo === null) {
    return "";
  }
  return ishtml ? `<strong>Party size:</strong> ${dineInInfo.partySize}<br \>` : `Party size: ${dineInInfo.partySize}\n`;
}

const GenerateDineInPlusString = (dineInInfo: DineInInfoDto | null) => dineInInfo !== null && dineInInfo.partySize > 1 ? `+${dineInInfo.partySize - 1}` : "";

const EventTitleStringBuilder = (menu: IMenu, fulfillmentConfig: FulfillmentConfig, customer: string, dineInInfo: DineInInfoDto | null, cart: CategorizedRebuiltCart, special_instructions: string, ispaid: boolean) => {
  const catalogCategories = CatalogProviderInstance.Catalog.categories;
  const has_special_instructions = special_instructions && special_instructions.length > 0;

  const titles = Object.entries(cart).map(([catid, category_cart]) => {
    const category = catalogCategories[catid].category;
    const call_line_category_name_with_space = category.display_flags && category.display_flags.call_line_name ? `${category.display_flags.call_line_name} ` : "";
    // TODO: this is incomplete since both technically use the shortcode for now. so we don't get modifiers in the call line
    // pending https://app.asana.com/0/1192054646278650/1192054646278651
    switch (category.display_flags.call_line_display) {
      case CALL_LINE_DISPLAY.SHORTCODE:
        var total = 0;
        var product_shortcodes: string[] = [];
        category_cart.forEach(item => {
          total += item.quantity;
          product_shortcodes = product_shortcodes.concat(Array(item.quantity).fill(GenerateShortCode(menu, item.product)));
        });
        return `${total.toString(10)}x ${call_line_category_name_with_space}${product_shortcodes.join(" ")}`;
      case CALL_LINE_DISPLAY.SHORTNAME:
        var product_shortcodes: string[] = category_cart.map(item => `${item.quantity}x${GenerateShortCode(menu, item.product)}`);
        return `${call_line_category_name_with_space}${product_shortcodes.join(" ")}`;
    }
  });
  return `${fulfillmentConfig.shortcode} ${customer}${GenerateDineInPlusString(dineInInfo)} ${titles.join(" ")}${has_special_instructions ? " *" : ""}${ispaid ? " PAID" : " UNPAID"}`;
};

const ServiceTitleBuilder = (service_option_display_string: string, fulfillmentInfo: FulfillmentDto, customer_name: string, service_time_interval: Interval) => {
  const display_service_time_interval = DateTimeIntervalToDisplayServiceInterval(service_time_interval);
  return `${service_option_display_string} for ${customer_name}${GenerateDineInPlusString(fulfillmentInfo.dineInInfo)} on ${format(service_time_interval.start, WDateUtils.ServiceDateDisplayFormat)} at ${display_service_time_interval}`;
}

const GenerateDisplayCartStringListFromProducts = (cart: CategorizedRebuiltCart) =>
  Object.values(cart).map((category_cart) => category_cart.map((item) => `${item.quantity}x: ${item.product.m.name}`)).flat(1);


const GenerateShortCartFromFullCart = (cart: CategorizedRebuiltCart) => {
  const catalogCategories = CatalogProviderInstance.Catalog.categories;
  return Object.entries(cart).map(([catid, category_cart]) => {
    if (category_cart.length > 0) {
      const category_name = catalogCategories[catid].category.name;
      const category_shortcart = { category_name: category_name, products: category_cart.map(x => `${x.quantity}x: ${x.product.m.shortname}`) };
      return category_shortcart;
    }
  })
}

const RebuildOrderState = function (menu: IMenu, cart: CoreCartEntry<WCPProductV2Dto>[], service_time: Date | number, fulfillmentConfig: FulfillmentConfig) {
  const catalogSelectors = CatalogProviderInstance.CatalogSelectors;
  const noLongerAvailable: CoreCartEntry<WCPProductV2Dto>[] = [];

  const rebuiltCart: CategorizedRebuiltCart = cart.reduce(
    (acc, entry) => {
      const product = CreateProductWithMetadataFromV2Dto(entry.product, catalogSelectors, service_time, fulfillmentConfig.id);
      if (!CanThisBeOrderedAtThisTimeAndFulfillment(product.p, menu, catalogSelectors, service_time, fulfillmentConfig.id) || !catalogSelectors.category(entry.categoryId)) {
        noLongerAvailable.push(entry);
      }
      const rebuiltEntry: CoreCartEntry<WProduct> = { ...entry, product };
      return { ...acc, [entry.categoryId]: Object.hasOwn(acc, entry.categoryId) ? [...acc[entry.categoryId], rebuiltEntry] : [rebuiltEntry] }
    }, {} as CategorizedRebuiltCart);

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
    tipAmount
  };
}
const CreateInternalEmail = async (
  order: WOrderInstance,
  service_title: string,
  requestTime: Date | number,
  dateTimeInterval: Interval,
  cart: CategorizedRebuiltCart,
  isPaid: boolean,
  totals: RecomputeTotalsResult,
  ipAddress: string) => {

  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const sameDayOrder = isSameDay(requestTime, dateTimeInterval.start);
  const payment_section = isPaid ? GeneratePaymentSection(totals, order.discounts, order.payments, true) : "";
  const delivery_section = GenerateDeliverySection(order.fulfillment.deliveryInfo, true);
  const dineInSection = GenerateDineInSection(order.fulfillment.dineInInfo, true);
  const shortcart = GenerateShortCartFromFullCart(cart);
  const special_instructions_section = order.specialInstructions && order.specialInstructions.length > 0 ? "<br />Special Instructions: " + order.specialInstructions : "";
  const emailbody = `<p>From: ${order.customerInfo.givenName} ${order.customerInfo.familyName} ${order.customerInfo.email}</p>${dineInSection}
<p>${shortcart.map(x => `<strong>${x.category_name}:</strong><br />${x.products.join("<br />")}`).join("<br />")}
${special_instructions_section}<br />
Phone: ${order.customerInfo.mobileNum}</p>
${sameDayOrder ? "" : '<strong style="color: red;">DOUBLE CHECK THIS IS FOR TODAY BEFORE SENDING THE TICKET</strong> <br />'}

    
<p>Referral Information: ${order.customerInfo.referral}</p>

${delivery_section}    

${payment_section}

<p>Debug info:<br />
Load: ${formatRFC3339(order.metrics.pageLoadTime)}<br />
Time select: ${FormatDurationHelper(order.metrics.timeToServiceTime)}<br />
Submit: ${FormatDurationHelper(order.metrics.submitTime)}<br />
Stages: ${order.metrics.timeToStage.map((t, i) => `S${i}: ${FormatDurationHelper(t)}`).join(", ")}<br />
Time Bumps: ${order.metrics.numTimeBumps}<br />
User IP: ${ipAddress}<br />
<p>Useragent: ${order.metrics.useragent}</p>`;
  return await GoogleProviderInstance.SendEmail(
    {
      name: `${order.customerInfo.givenName} ${order.customerInfo.familyName}`,
      address: EMAIL_ADDRESS
    },
    EMAIL_ADDRESS,
    service_title + (isPaid ? " *ORDER PAID*" : " _UNPAID_"),
    order.customerInfo.email,
    emailbody);
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
  const delivery_section = GenerateDeliverySection(order.fulfillment.deliveryInfo, true);
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

const CreateOrderEvent = async (
  menu: IMenu,
  fulfillmentConfig: FulfillmentConfig,
  order: Pick<WOrderInstance, 'customerInfo' | 'fulfillment' | 'payments' | 'discounts' | 'specialInstructions'>,
  cart: CategorizedRebuiltCart,
  service_time_interval: Interval,
  isPaid: boolean,
  totals: RecomputeTotalsResult) => {
  const shortcart = GenerateShortCartFromFullCart(cart);
  const customerName = `${order.customerInfo.givenName} ${order.customerInfo.familyName}`;
  const calendar_event_title = EventTitleStringBuilder(menu, fulfillmentConfig, customerName, order.fulfillment.dineInInfo, cart, order.specialInstructions, isPaid);
  const special_instructions_section = order.specialInstructions && order.specialInstructions.length > 0 ? `\nSpecial Instructions: ${order.specialInstructions}` : "";
  const payment_section = isPaid ? "\n" + GeneratePaymentSection(totals, order.discounts, order.payments, false) : "";
  const delivery_section = GenerateDeliverySection(order.fulfillment.deliveryInfo, false);
  const dineInSecrtion = GenerateDineInSection(order.fulfillment.dineInInfo, false);
  const calendar_details = `${shortcart.map(x => `${x.category_name}:\n${x.products.join("\n")}`).join("\n")}\n${dineInSecrtion}ph: ${order.customerInfo.mobileNum}${special_instructions_section}${delivery_section}${payment_section}`;

  return await GoogleProviderInstance.CreateCalendarEvent({
    summary: calendar_event_title,
    location: order.fulfillment.deliveryInfo?.validation.validated_address ?? "",
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

export class OrderManager implements WProvider {
  constructor() {
  }

  public GetOrder = async (orderId: string): Promise<WOrderInstance | null> => {
    // find order and return
    return await WOrderInstanceModel.findById(orderId);
  };

  public GetOrders = async (queryDate: string | null, queryStatus: WOrderStatus | null): Promise<WOrderInstance[]> => {
    // find orders and return
    return await WOrderInstanceModel.find({
      ...(queryDate ? { 'fulfillment.selectedDate': queryDate } : {}),
      ...(queryStatus ? { 'status': queryStatus } : {})
    }).exec();
  };

  public DiscountOrder = async (idempotencyKey: string, orderId: string, reason: string) => {
    // TODO
  }

  public CancelOrder = async (idempotencyKey: string, orderId: string, reason: string, emailCustomer: boolean): Promise<CreateOrderResponse & { status: number }> => {
    logger.info(`Received request (nonce: ${idempotencyKey}) to cancel order ${orderId} for reason: ${reason}`);
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: null, id: orderId, status: { $in: [WOrderStatus.OPEN, WOrderStatus.CONFIRMED] } },
      { locked: idempotencyKey },
      { new: true })
      .then(async (lockedOrder) => {
        logger.debug(`Found order ${JSON.stringify(lockedOrder, null, 2)}, lock applied.`);
        const errors: WError[] = [];
        try {
          const squareOrderId = lockedOrder.metadata.find(x => x.key === 'SQORDER')!.value;

          // lookup Square Order for payments and version number
          const retrieveSquareOrderResponse = await SquareProviderInstance.RetrieveOrder(squareOrderId);
          if (!retrieveSquareOrderResponse.success) {
            // unable to find the order
            retrieveSquareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail }));
            return { status: 404, success: false, errors, result: null };
          }
          const squareOrder = retrieveSquareOrderResponse.result.order!;
          let version = squareOrder.version;

          // refund store credits
          const discountCreditRefunds = lockedOrder.discounts.map(async (discount) => {
            return StoreCreditProviderInstance.RefundStoreCredit(discount.discount.code, discount.discount.amount, 'WARIO');
          });

          // refund square payments
          const paymentRefunds = lockedOrder.payments.map(async (payment) => {
            if (payment.t === PaymentMethod.StoreCredit) {
              // refund the credit in the store credit DB
              StoreCreditProviderInstance.RefundStoreCredit(payment.payment.code, payment.amount, 'WARIO');
            }
            const undoPaymentResponse = await (lockedOrder.status === WOrderStatus.CONFIRMED ?
              SquareProviderInstance.RefundPayment(payment.payment.processorId, payment.amount, reason) :
              SquareProviderInstance.CancelPayment(payment.payment.processorId));
            version += 1;
            if (!undoPaymentResponse.success) {
              const errorDetail = `Failed to process payment refund for payment ID: ${payment.payment.processorId}`;
              logger.error(errorDetail);
              undoPaymentResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail }));
            }
            return undoPaymentResponse;
          });
          // TODO: check refund statuses

          // cancel square fulfillment(s) and the order if it's not paid
          if (squareOrder.state === 'OPEN') {
            const updateSquareOrderResponse = await SquareProviderInstance.OrderUpdate(squareOrderId, version, {
              ...(lockedOrder.status === WOrderStatus.OPEN ? { state: 'CANCELED' } : {}),
              fulfillments: squareOrder.fulfillments.map(x => ({
                uid: x.uid,
                state: 'CANCELED'
              }))
            }, []);
            if (!updateSquareOrderResponse.success) {
              updateSquareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail }));
              return { status: 500, success: false, result: null, errors };
            }
          } else {
            // is this an error condition?
          }


          // send email if we're supposed to
          if (emailCustomer) {
            await CreateExternalCancelationEmail(lockedOrder, reason);
          }

          // delete calendar entry
          const gCalEventId = lockedOrder.metadata.find(x => x.key === 'GCALEVENT')?.value;
          if (gCalEventId) {
            await GoogleProviderInstance.DeleteCalendarEvent(gCalEventId);
          }

          // update order in DB, release lock
          return await WOrderInstanceModel.findOneAndUpdate(
            { locked: idempotencyKey, id: orderId },
            {
              locked: null, status: WOrderStatus.CANCELED
              // TODO: need to add refunds to the order too?
            },
            { new: true })
            .then(async (updatedOrder) => {
              // TODO: free up order slot and unblock time as appropriate

              // send notice to subscribers

              // return to caller
              SocketIoProviderInstance.EmitOrder(updatedOrder.toObject());
              return { status: 200, success: true, errors: [], result: updatedOrder };
            })
            .catch((err: any) => {
              const errorDetail = `Unable to commit update to order to release lock and cancel. Got error: ${JSON.stringify(err, null, 2)}`;
              return { status: 500, success: false, result: null, errors: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
            })
        } catch (error: any) {
          const errorDetail = `Caught error when attempting to cancel order: ${JSON.stringify(error, null, 2)}`;
          logger.error(errorDetail);
          return { status: 500, success: false, result: null, errors: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
        }
      })
      .catch((err: any) => {
        const errorDetail = `Unable to find ${orderId} that can be canceled. Got error: ${JSON.stringify(err, null, 2)}`;
        logger.error(errorDetail);
        return { status: 404, success: false, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND', detail: errorDetail }], result: null };
      });
  };

  public AdjustOrderTime = async (idempotencyKey: string, orderId: string, newTime: FulfillmentTime, emailCustomer: boolean): Promise<CreateOrderResponse & { status: number }> => {
    const promisedTime = WDateUtils.ComputeServiceDateTime(newTime);
    logger.info(`Received request (nonce: ${idempotencyKey}) to adjust order ${orderId} time to: ${format(promisedTime, WDateUtils.ISODateTimeNoOffset)}`);
    // find order and acquire lock
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: null, id: orderId, status: { $in: [WOrderStatus.OPEN, WOrderStatus.CONFIRMED] } },
      { locked: idempotencyKey },
      { new: true })
      .then(async (lockedOrder) => {

        // lookup Square Order
        const squareOrderId = lockedOrder.metadata.find(x => x.key === 'SQORDER')!.value;
        const retrieveSquareOrderResponse = await SquareProviderInstance.RetrieveOrder(squareOrderId);
        if (!retrieveSquareOrderResponse.success) {
          // unable to find the order
          return { status: 405, success: false, errors: retrieveSquareOrderResponse.error, result: null };
        }
        const squareOrder = retrieveSquareOrderResponse.result.order!;
        if (squareOrder.state !== 'OPEN') {
          // unable to edit the order at this point, error out
          return { status: 405, success: false, errors: [], result: null };
        }


        //adjust square fulfillment
        const updateSquareOrderResponse = await SquareProviderInstance.OrderUpdate(squareOrderId, squareOrder.version, {
          fulfillments: squareOrder.fulfillments.map(x => ({ uid: x.uid, pickupDetails: { pickupAt: formatRFC3339(promisedTime) } })),
          }, []);
        if (!updateSquareOrderResponse.success) {
          // failed to update square order fulfillment

          logger.error(``)
        }

        // adjust calendar event
        const gCalEventId = lockedOrder.metadata.find(x => x.key === 'GCALEVENT')?.value;
        const fulfillmentConfig = DataProviderInstance.Fulfillments[lockedOrder.fulfillment.selectedService];
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

        // send email to customer
        if (emailCustomer) {

        }

        // adjust DB event
        return await WOrderInstanceModel.findOneAndUpdate(
          { locked: idempotencyKey, id: orderId, status: { $in: [WOrderStatus.OPEN, WOrderStatus.CONFIRMED] } },
          { locked: null, 'fulfillment.selectedDate': newTime.selectedDate, 'fulfillment.selectedTime': newTime.selectedTime },
          { new: true })
          .then(async (updatedOrder) => {

            // return success/failure
            SocketIoProviderInstance.EmitOrder(updatedOrder.toObject());
            return { status: 200, success: true, errors: [], result: updatedOrder };
          })
          .catch((err: any) => {
            const errorDetail = `Unable to commit update to order to release lock and update fulfillment time. Got error: ${JSON.stringify(err, null, 2)}`;
            logger.error(errorDetail);
            return { status: 500, success: false, result: null, errors: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
          })
      })
      .catch((err: any) => {
        const errorDetail = `Unable to find ${orderId} that can be updated. Got error: ${JSON.stringify(err, null, 2)}`;
        logger.error(errorDetail);
        return { status: 404, success: false, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND', detail: errorDetail }], result: null };
      });

  }

  public ConfirmOrder = async (idempotencyKey: string, orderId: string, messageToCustomer: string): Promise<CreateOrderResponse & { status: number }> => {
    logger.info(`Received request (nonce: ${idempotencyKey}) to confirm order ${orderId}`);
    // find order and acquire lock
    return await WOrderInstanceModel.findOneAndUpdate(
      { locked: null, id: orderId, status: { $in: [WOrderStatus.OPEN] } },
      { locked: idempotencyKey },
      { new: true })
      .then(async (lockedOrder) => {

        // lookup Square Order
        const squareOrderId = lockedOrder.metadata.find(x => x.key === 'SQORDER')!.value;
        const retrieveSquareOrderResponse = await SquareProviderInstance.RetrieveOrder(squareOrderId);
        if (!retrieveSquareOrderResponse.success) {
          // unable to find the order
          return { status: 405, success: false, errors: retrieveSquareOrderResponse.error, result: null };
        }
        const squareOrder = retrieveSquareOrderResponse.result.order!;
        if (squareOrder.state !== 'OPEN') {
          // unable to edit the order at this point, error out
          return { status: 405, success: false, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'UNEXPECTED_VALUE', detail: 'Square order found, but not in a state where we can confirm it' }], result: null };
        }

        // mark the order paid via PayOrder endpoint
        const payOrderResponse = await SquareProviderInstance.PayOrder(squareOrder.id, squareOrder.tenders.map(x => x.id));
        if (payOrderResponse.success) {
          logger.info(`Square order successfully marked paid.`);
          // send email to customer
          await CreateExternalConfirmationEmail(lockedOrder, true);
          // adjust DB event
          return await WOrderInstanceModel.findOneAndUpdate(
            { locked: idempotencyKey, id: orderId, status: { $in: [WOrderStatus.OPEN] } },
            { locked: null, status: WOrderStatus.CONFIRMED }, // TODO: payments status need to be changed as committed to the DB
            { new: true })
            .then(async (updatedOrder) => {

              // return success/failure
              SocketIoProviderInstance.EmitOrder(updatedOrder.toObject());
              return { status: 200, success: true, errors: [], result: updatedOrder };
            })
            .catch((err: any) => {
              const errorDetail = `Unable to commit update to order to release lock and update fulfillment time. Got error: ${JSON.stringify(err, null, 2)}`;
              logger.error(errorDetail);
              return { status: 500, success: false, result: null, errors: [{ category: 'API_ERROR', code: 'INTERNAL_SERVER_ERROR', detail: errorDetail }] };
            })
        } else {
          const errorDetail = `Failed to pay the order: ${JSON.stringify(payOrderResponse)}`;
          logger.error(errorDetail);
          return { status: 422, success: false, errors: payOrderResponse.error, result: null };
        }
      })
      .catch((err: any) => {
        const errorDetail = `Unable to find ${orderId} that can be updated. Got error: ${JSON.stringify(err, null, 2)}`;
        logger.error(errorDetail);
        return { status: 404, success: false, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND', detail: errorDetail }], result: null };
      });
  };

  public CreateOrder = async (createOrderRequest: CreateOrderRequestV2, ipAddress: string): Promise<CreateOrderResponse & { status: number }> => {
    const requestTime = Date.now();

    // 1. get the fulfillment and other needed constants from the DataProvider, generate a reference ID, quick computations
    if (!Object.hasOwn(DataProviderInstance.Fulfillments, createOrderRequest.fulfillment.selectedService)) {
      return { status: 404, success: false, result: null, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND', detail: "Fulfillment specified does not exist." }] };
    }
    const fulfillmentConfig = DataProviderInstance.Fulfillments[createOrderRequest.fulfillment.selectedService];
    const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
    const reference_id = requestTime.toString(36).toUpperCase();
    const dateTimeInterval = DateTimeIntervalBuilder(createOrderRequest.fulfillment, fulfillmentConfig);
    const customer_name = [createOrderRequest.customerInfo.givenName, createOrderRequest.customerInfo.familyName].join(" ");
    const service_title = ServiceTitleBuilder(fulfillmentConfig.displayName, createOrderRequest.fulfillment, customer_name, dateTimeInterval);
    // 2. Rebuild the order from the menu/catalog
    const menu = GenerateMenu(CatalogProviderInstance.CatalogSelectors, CatalogProviderInstance.Catalog.version, dateTimeInterval.start, createOrderRequest.fulfillment.selectedService);
    const { noLongerAvailable, rebuiltCart } = RebuildOrderState(menu, createOrderRequest.cart, dateTimeInterval.start, fulfillmentConfig);
    if (noLongerAvailable.length > 0) {
      return {
        status: 410,
        success: false,
        result: null,
        errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'GONE', detail: "Unable to rebuild order from current catalog data." }]
      };
    }

    // 3. 'let's setup the order object reference
    const orderInstance: WOrderInstancePartial = {
      cart: createOrderRequest.cart,
      customerInfo: createOrderRequest.customerInfo,
      fulfillment: createOrderRequest.fulfillment,
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
        result: null,
        errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: errorDetail }]
      };
    }
    if (recomputedTotals.balanceAfterCredits.amount > 0 && !createOrderRequest.nonce) {
      const errorDetail = 'Order balance is non-zero and no payment method provided.';
      logger.error(errorDetail)
      return {
        status: 500,
        success: false,
        result: null,
        errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: errorDetail }]
      };
    }

    if (recomputedTotals.tipAmount.amount < recomputedTotals.tipMinimum.amount) {
      const errorDetail = `Computed tip below minimum of ${MoneyToDisplayString(recomputedTotals.tipMinimum, true)} vs sent: ${MoneyToDisplayString(recomputedTotals.tipAmount, true)}`;
      logger.error(errorDetail)
      return {
        status: 500,
        success: false,
        result: null,
        errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: errorDetail }]
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
        result: null,
        errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'GONE', detail: errorDetail }]
      };
    }

    // 5. enter payment subsection
    let isPaid = false;
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
      return { status: 404, success: false, result: null, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: "Unable to debit store credit." }] };
    }

    if (recomputedTotals.balanceAfterCredits.amount === 0) {
      isPaid = true;
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
    let hasChargingSucceeded = false;
    let squareOrder: SquareOrder | null = null;
    let orderUpdateCount = 0;
    const squarePayments: OrderPayment[] = [];
    try {
      const squareOrderResponse = await (SquareProviderInstance.CreateOrderCart(
        reference_id,
        orderInstanceBeforeCharging,
        dateTimeInterval.start,
        rebuiltCart,
        ""));
      if (squareOrderResponse.success === true) {
        squareOrder = squareOrderResponse.result.order;
        logger.info(`For internal id ${reference_id} created Square Order ID: ${squareOrder.id}`);
        // Payment Part C: create payments
        //  substep i: close out the order via credit card payment or if no money credit payments either, a 0 cash money payment, 
        if (recomputedTotals.balanceAfterCredits.amount > 0 || moneyCreditPayments.length === 0) {
          const squarePaymentResponse = await SquareProviderInstance.CreatePayment({
            sourceId: recomputedTotals.balanceAfterCredits.amount > 0 ? createOrderRequest.nonce : 'CASH',
            amount: recomputedTotals.balanceAfterCredits,
            tipAmount: { currency: recomputedTotals.tipAmount.currency, amount: tipAmountRemaining },
            referenceId: reference_id,
            squareOrderId: squareOrder.id,
            autocomplete: false
          });
          orderUpdateCount += 1;
          if (squarePaymentResponse.success === true) {
            logger.info(`For internal id ${reference_id} and Square Order ID: ${squareOrder.id} payment for ${MoneyToDisplayString(squarePaymentResponse.result.amount, true)} successful.`)
            squarePayments.push(squarePaymentResponse.result);
          } else {
            const errorDetail = `Failed to process payment: ${JSON.stringify(squarePaymentResponse)}`;
            logger.error(errorDetail);
            squarePaymentResponse.error.forEach(e => errors.push({ category: e.category, code: e.code, detail: e.detail }))
            // throw for flow control
            throw errorDetail;
          }
        }
        // Payment Part C, substep ii: process money store credit payments
        await Promise.all(moneyCreditPayments.map(async (payment) => {
          try {
            const squareMoneyCreditPaymentResponse = await SquareProviderInstance.CreatePayment({
              sourceId: "EXTERNAL",
              storeCreditPayment: payment,
              amount: payment.amount,
              tipAmount: payment.tipAmount,
              referenceId: payment.payment.code,
              squareOrderId: squareOrder.id,
              autocomplete: false
            });
            orderUpdateCount += 1;
            if (squareMoneyCreditPaymentResponse.success === true) {
              logger.info(`For internal id ${reference_id} and Square Order ID: ${squareOrder.id} payment for ${MoneyToDisplayString(squareMoneyCreditPaymentResponse.result.amount, true)} successful.`)
              //this next line duplicates the store credit payments, since we already have them independently processed
              squarePayments.push(squareMoneyCreditPaymentResponse.result);
            } else {
              const errorDetail = `Failed to process payment: ${JSON.stringify(squareMoneyCreditPaymentResponse)}`;
              logger.error(errorDetail);
              squareMoneyCreditPaymentResponse.error.forEach(e => (errors.push({ category: e.category, code: e.code, detail: e.detail })));
            }
          }
          catch (err: any) {
            logger.error(`got error in processing money store credit of ${JSON.stringify(payment)} and error: ${JSON.stringify(err)}`);
            throw err;
          }
        }));

        // THE GOAL YALL
        hasChargingSucceeded = true;

      } else {
        logger.error(`Failed to create order: ${JSON.stringify(squareOrderResponse.error)}`);
        squareOrderResponse.error.map(e => errors.push({ category: e.category, code: e.code, detail: e.detail }))
      }
    } catch (err: any) {
      logger.error(JSON.stringify(err));
      // pass
    }
    // Payment part E: make sure it worked and if not, undo the payments
    if (!hasChargingSucceeded) {
      try {
        if (squareOrder !== null) {
          SquareProviderInstance.OrderStateChange(squareOrder.id, squareOrder.version + orderUpdateCount, "CANCELED");
        }
        RefundSquarePayments(squarePayments, 'Refunding failed order');
        CancelSquarePayments(squarePayments);
        RefundStoreCreditDebits(storeCreditResponses);
      }
      catch (err: any) {
        logger.error(`Got error when unwinding the order after failure: ${JSON.stringify(err)}`);
        return { status: 500, success: false, result: null, errors };
      }
      return { status: 400, success: false, result: null, errors };
    }
    else {
      isPaid = true;
    }

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
        menu,
        fulfillmentConfig,
        completedOrderInstance,
        rebuiltCart,
        dateTimeInterval,
        isPaid,
        recomputedTotals)
        .then(async (orderEvent) => {
          return await new WOrderInstanceModel({
            ...completedOrderInstance,
            metadata: [
              { key: 'SQORDER', value: squareOrder.id },
              { key: 'GCALEVENT', value: orderEvent.data.id }]
          })
            .save()
            .then(async (dbOrderInstance) => {
              logger.info(`Successfully saved OrderInstance to database: ${JSON.stringify(dbOrderInstance.toJSON())}`)
              // TODO, need to actually test the failure of these service calls and some sort of retrying
              // for example, the event not created error happens, and it doesn't fail the service call. it should

              // send email to customer
              const createExternalEmailInfo = CreateExternalEmail(
                dbOrderInstance,
                service_title,
                rebuiltCart);

              // send email to eat(pie)
              const createInternalEmailInfo = CreateInternalEmail(
                dbOrderInstance,
                service_title,
                requestTime,
                dateTimeInterval,
                rebuiltCart,
                isPaid,
                recomputedTotals,
                ipAddress);

              SocketIoProviderInstance.EmitOrder(dbOrderInstance.toObject());

              return { status: 200, success: true, errors, result: dbOrderInstance.toObject() };
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
      await RefundSquarePayments(squarePayments, 'Refunding failed order');
      await RefundStoreCreditDebits(storeCreditResponses);
      return { status: 500, success: false, result: null, errors };
    }
  };

  Bootstrap = async () => {
    logger.info("Order Manager Bootstrap");
    logger.info("Order Manager Bootstrap completed.");
  };


}

export const OrderManagerInstance = new OrderManager();
