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
  ComputeDiscountApplied, 
  ComputeTaxAmount, 
  ComputeTipBasis, 
  ComputeTipValue, 
  TotalsV2, 
  ComputeTotal, 
  ComputeGiftCardApplied, 
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
  WOrderInstanceNoId, 
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
  DateTimeIntervalBuilder } from "@wcp/wcpshared";

import { WProvider } from '../types/WProvider';

import { formatRFC3339, format, Interval, addMinutes, isSameMinute, isSameDay, formatISO, intervalToDuration, formatDuration } from 'date-fns';
import GoogleProvider from "./google";
import SquareProvider from "./square";
import StoreCreditProvider from "./store_credit_provider";
import CatalogProviderInstance from './catalog_provider';
import DataProviderInstance from './dataprovider';
import logger from '../logging';
import { BigIntStringify } from "../utils";
import { OrderFunctional } from "@wcp/wcpshared";
import { WOrderInstanceModel } from "../models/orders/WOrderInstance";

const WCP = "Windy City Pie";

const IL_AREA_CODES = ["217", "309", "312", "630", "331", "618", "708", "773", "815", "779", "847", "224", "872"];
const MI_AREA_CODES = ["231", "248", "269", "313", "517", "586", "616", "734", "810", "906", "947", "989", "679"];

const BTP_AREA_CODES = IL_AREA_CODES.concat(MI_AREA_CODES);
const WCP_AREA_CODES = IL_AREA_CODES;

const FormatDurationHelper = function (milliseconds: number) {
  return formatDuration(intervalToDuration({ start: 0, end: milliseconds }));
}


interface RecomputeTotalsArgs {
  order: WOrderInstanceNoId;
  cart: CategorizedRebuiltCart;
  creditValidations: JSFECreditV2[];
  fulfillment: FulfillmentConfig;
  totals: TotalsV2;
}

export interface RecomputeTotalsResult {
  mainCategoryProductCount: number;
  cartSubtotal: IMoney;
  serviceFee: IMoney;
  subtotalPreDiscount: IMoney;
  subtotalAfterDiscount: IMoney;
  discountApplied: IMoney;
  taxAmount: IMoney;
  tipBasis: IMoney;
  tipMinimum: IMoney;
  total: IMoney;
  giftCartApplied: IMoney;
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

const GenerateAutoResponseBodyEscaped = function (
  fulfillmentConfig: FulfillmentConfig,
  date_time_interval: Interval,
  phone_number: string,
  isPaid: boolean
) {
  const NOTE_PREPAID = "You've already paid, so unless there's an issue with the order, there's no need to handle payment from this point forward.";
  const NOTE_PAYMENT = "We happily accept any major credit card or cash for payment.";
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const STORE_ADDRESS = DataProviderInstance.KeyValueConfig.STORE_ADDRESS;

  const nice_area_code = IsNativeAreaCode(phone_number, STORE_NAME === WCP ? WCP_AREA_CODES : BTP_AREA_CODES);
  const payment_section = isPaid ? NOTE_PREPAID : NOTE_PAYMENT;
  const display_time = DateTimeIntervalToDisplayServiceInterval(date_time_interval);
  // const confirm = [`We're happy to confirm your ${display_time} pickup at`, `We're happy to confirm your ${display_time} at`, `We're happy to confirm your delivery around ${display_time} at`];
  // const where = [STORE_ADDRESS, STORE_ADDRESS, delivery_info?.validation.validated_address ?? "NOPE"];
  // TODO: need to message the delivery address if relevant
  return encodeURIComponent(`${nice_area_code ? "Hey, nice area code!" : "Thanks!"} ${fulfillmentConfig.messages.CONFIRMATION} ${STORE_ADDRESS}.\n\n${fulfillmentConfig.messages.INSTRUCTIONS} ${payment_section}`);
}

function GenerateOrderPaymentDisplay(payment: OrderPayment, isHtml: boolean) { 
  const lineBreak = isHtml ? "<br />" : "\n";
  switch(payment.t) {
    case PaymentMethod.Cash: 
      return `Received cash payment of ${MoneyToDisplayString(payment.amount, true)}.${lineBreak}`;
    case PaymentMethod.CreditCard:
      return `Received payment of ${MoneyToDisplayString(payment.amount, true)} from credit card ending in ${payment.last4}.
      ${lineBreak}
      ${payment.receiptUrl ? 
        (isHtml ? 
          `<a href="${payment.receiptUrl}">Receipt link</a>${lineBreak}` : 
          `Receipt: ${payment.receiptUrl}${lineBreak}`) : 
        ""}`;
    case PaymentMethod.StoreCredit:
      return `Applied store credit value ${MoneyToDisplayString(payment.amount, true)} using code ${payment.code}.${lineBreak}`;
  }
}

function GenerateOrderLineDiscountDisplay(discount: OrderLineDiscount, isHtml: boolean) { 
  switch(discount.t) {
    case DiscountMethod.CreditCodeAmount: 
      return `NOTE BEFORE CLOSING OUT: Apply discount of ${discount.amount}, pre-tax. Credit code used: ${discount.code}.${isHtml ? "<br />" : "\n"}`;
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

const GenerateDisplayCartStringListFromProducts = (cart: CategorizedRebuiltCart) => {
  const display_cart_string_list: string[] = [];
  Object.values(cart).forEach((category_cart) => {
    category_cart.forEach((item) => {
      display_cart_string_list.push(`${item.quantity}x: ${item.product.m.name}`)
    });
  });
  return display_cart_string_list;
}

const GenerateShortCartFromFullCart = (cart: CategorizedRebuiltCart) => {
  // TODO: the sliced part of this is a hack. need to move to a modifier that takes into account the service type
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
  const catalog = CatalogProviderInstance.Catalog;
  const catalogCategories = catalog.categories;
  const noLongerAvailable: CoreCartEntry<WCPProductV2Dto>[] = [];

  const rebuiltCart: CategorizedRebuiltCart = cart.reduce(
    (acc, entry) => {
      const product = CreateProductWithMetadataFromV2Dto(entry.product, catalog, menu, service_time, fulfillmentConfig.id);
      if (!CanThisBeOrderedAtThisTimeAndFulfillment(product.p, menu, catalog, service_time, fulfillmentConfig.id) || !Object.hasOwn(catalogCategories, entry.categoryId)) {
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


const RecomputeTotals = function ({ cart, creditValidations, fulfillment, order, totals }: RecomputeTotalsArgs): RecomputeTotalsResult {
  const cfg = DataProviderInstance.Settings.config;
  const MAIN_CATID = cfg.MAIN_CATID as string;
  const TAX_RATE = cfg.TAX_RATE as number;
  const AUTOGRAT_THRESHOLD = cfg.AUTOGRAT_THRESHOLD as number;

  // TODO: validate the amount used field in the creditValidations

  const mainCategoryProductCount = Object.hasOwn(cart, MAIN_CATID) ? cart[MAIN_CATID].reduce((acc, e) => acc + e.quantity, 0) : 0;
  const cartSubtotal = { currency: CURRENCY.USD, amount: Object.values(cart).reduce((acc, c) => acc + ComputeCartSubTotal(c).amount, 0) };
  const serviceFee = { currency: CURRENCY.USD, amount: fulfillment.serviceCharge !== null ? OrderFunctional.ProcessOrderInstanceFunction(order, CatalogProviderInstance.Catalog.orderInstanceFunctions[fulfillment.serviceCharge], CatalogProviderInstance.Catalog) as number : 0 };
  const subtotalPreDiscount = ComputeSubtotalPreDiscount(cartSubtotal, serviceFee);
  const discountApplied = ComputeDiscountApplied(subtotalPreDiscount, creditValidations.map(x => x.validation));
  const subtotalAfterDiscount = ComputeSubtotalAfterDiscount(subtotalPreDiscount, discountApplied);
  const taxAmount = ComputeTaxAmount(subtotalAfterDiscount, TAX_RATE);
  const tipBasis = ComputeTipBasis(subtotalPreDiscount, taxAmount);
  const tipMinimum = mainCategoryProductCount >= AUTOGRAT_THRESHOLD ? ComputeTipValue({ isPercentage: true, isSuggestion: true, value: .2 }, tipBasis) : { currency: CURRENCY.USD, amount: 0 };
  const tipAmount = totals.tip;
  const total = ComputeTotal(subtotalAfterDiscount, taxAmount, tipAmount);
  const giftCartApplied = ComputeGiftCardApplied(total, creditValidations.map(x => x.validation));
  const balanceAfterCredits = ComputeBalanceAfterCredits(total, giftCartApplied);
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
  fulfillmentConfig: FulfillmentConfig,
  service_title: string,
  requestTime: Date | number,
  dateTimeInterval: Interval,
  cart: CategorizedRebuiltCart,
  special_instructions: string,
  isPaid: boolean,
  totals: RecomputeTotalsResult,
  ipAddress: string) => {

  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const sameDayOrder = isSameDay(requestTime, dateTimeInterval.start);
  const confirmation_body_escaped = GenerateAutoResponseBodyEscaped(fulfillmentConfig, dateTimeInterval, order.customerInfo.mobileNum, isPaid)
  const confirmation_subject_escaped = encodeURIComponent(service_title);
  const payment_section = isPaid ? GeneratePaymentSection(totals, order.discounts, order.payments, true) : "";
  const delivery_section = GenerateDeliverySection(order.fulfillment.deliveryInfo, true);
  const dineInSection = GenerateDineInSection(order.fulfillment.dineInInfo, true);
  const shortcart = GenerateShortCartFromFullCart(cart);
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "<br />Special Instructions: " + special_instructions : "";
  const emailbody = `<p>From: ${order.customerInfo.givenName} ${order.customerInfo.familyName} ${order.customerInfo.email}</p>${dineInSection}
<p>${shortcart.map(x => `<strong>${x.category_name}:</strong><br />${x.products.join("<br />")}`).join("<br />")}
${special_instructions_section}<br />
Phone: ${order.customerInfo.mobileNum}</p>
${sameDayOrder ? "" : '<strong style="color: red;">DOUBLE CHECK THIS IS FOR TODAY BEFORE SENDING THE TICKET</strong> <br />'}
Auto-respond: <a href="mailto:${order.customerInfo.email}?subject=${confirmation_subject_escaped}&body=${confirmation_body_escaped}">Confirmation link</a><br />
    
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
  return await GoogleProvider.SendEmail(
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
  fulfillmentConfig: FulfillmentConfig,
  service_title: string,
  cart: CategorizedRebuiltCart,
  specialInstructions: string,
  isPaid: boolean
) => {
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const ORDER_RESPONSE_PREAMBLE = DataProviderInstance.KeyValueConfig.ORDER_RESPONSE_PREAMBLE;
  const LOCATION_INFO = DataProviderInstance.KeyValueConfig.LOCATION_INFO;
  const cartstring = GenerateDisplayCartStringListFromProducts(cart);
  const paymentDisplays = order.payments.map(payment => GenerateOrderPaymentDisplay(payment, true)).join("<br />");
  const delivery_section = GenerateDeliverySection(order.fulfillment.deliveryInfo, true);
  const location_section = delivery_section ? "" : `<p><strong>Location Information:</strong>
We are located ${LOCATION_INFO}</p>`;
  const special_instructions_section = specialInstructions && specialInstructions.length > 0 ? `<p><strong>Special Instructions</strong>: ${specialInstructions} </p>` : "";
  const emailbody = `<p>${ORDER_RESPONSE_PREAMBLE}</p>
<p>We take your health seriously; be assured your order has been prepared with the utmost care.</p>
<p>Note that all gratuity is shared with the entire ${STORE_NAME} family.</p>
<p>${fulfillmentConfig.messages.CONFIRMATION}</p>
<p>Please take some time to ensure the details of your order as they were entered are correct. If the order is fine, there is no need to respond to this message. If you need to make a correction or have a question, please respond to this message as soon as possible.</p>
    
<b>Order information:</b><br />
Service: ${service_title}.<br />
Phone: ${order.customerInfo.mobileNum}<br />
Order contents:<br />
${cartstring.join("<br />")}
${special_instructions_section}
${delivery_section}
${paymentDisplays}
${location_section}We thank you for your support!`;
  return await GoogleProvider.SendEmail(
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
  order: WOrderInstance,
  cart: CategorizedRebuiltCart,
  specialInstructions: string,
  service_time_interval: Interval,
  isPaid: boolean,
  totals: RecomputeTotalsResult) => {
  const shortcart = GenerateShortCartFromFullCart(cart);
  const customerName = `${order.customerInfo.givenName} ${order.customerInfo.familyName}`;
  const calendar_event_title = EventTitleStringBuilder(menu, fulfillmentConfig, customerName, order.fulfillment.dineInInfo, cart, specialInstructions, isPaid);
  const special_instructions_section = specialInstructions && specialInstructions.length > 0 ? "\nSpecial Instructions: " + specialInstructions : "";
  const payment_section = isPaid ? "\n" + GeneratePaymentSection(totals, order.discounts, order.payments, false) : "";
  const delivery_section = GenerateDeliverySection(order.fulfillment.deliveryInfo, false);
  const dineInSecrtion = GenerateDineInSection(order.fulfillment.dineInInfo, false);
  const calendar_details = `${shortcart.map(x => `${x.category_name}:\n${x.products.join("\n")}`).join("\n")}\n${dineInSecrtion}ph: ${order.customerInfo.mobileNum}${special_instructions_section}${delivery_section}${payment_section}`;

  return await GoogleProvider.CreateCalendarEvent(calendar_event_title,
    order.fulfillment.deliveryInfo?.validation.validated_address ?? "",
    calendar_details,
    {
      dateTime: formatRFC3339(service_time_interval.start),
      timeZone: process.env.TZ
    },
    {
      dateTime: formatRFC3339(service_time_interval.end),
      timeZone: process.env.TZ
    });
}

const CreateSquareOrderAndCharge = async (reference_id: string, balance: IMoney, nonce: string, note: string) => {
  const create_order_response = await SquareProvider.CreateOrderStoreCredit(reference_id, balance, note);
  if (create_order_response.success === true) {
    const square_order_id = create_order_response.result.order.id;
    logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${MoneyToDisplayString(balance, true)}`)
    const payment_response = await SquareProvider.ProcessPayment(nonce, balance, reference_id, square_order_id);
    if (payment_response.success === false) {
      logger.error("Failed to process payment: %o", payment_response);
      await SquareProvider.OrderStateChange(square_order_id, create_order_response.result.order.version + 1, "CANCELED");
      return payment_response;
    }
    else {
      logger.info(`For internal id ${reference_id} and Square Order ID: ${square_order_id} payment for ${MoneyToDisplayString(balance, true)} successful.`)
      return payment_response;
    }
  }
  logger.error(`Got error in creating order ${BigIntStringify(create_order_response)}`);
  return create_order_response;
}

async function RefundStoreCreditDebits(spends: ValidateLockAndSpendSuccess[]) {
  return Promise.all(spends.map(async (x) => {
    logger.info(`Refunding ${JSON.stringify(x.entry)} after failed processing.`);
    return StoreCreditProvider.CheckAndRefundStoreCredit(x.entry, x.index);
  }))
}

export class OrderManager implements WProvider {
  constructor() {
  }

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
    const menu = GenerateMenu(CatalogProviderInstance.Catalog, dateTimeInterval.start, createOrderRequest.fulfillment.selectedService);
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
    let orderInstance: WOrderInstanceNoId = {
      status: 'OPEN',
      payments: [],
      refunds: [],
      discounts: [],
      cart: createOrderRequest.cart,
      customerInfo: createOrderRequest.customerInfo,
      fulfillment: createOrderRequest.fulfillment,
      metrics: createOrderRequest.metrics
    }

    // 3. recompute the totals to ensure everything matches up, and to get some needed computations that we don't want to pass over the wire and blindly trust
    const recomputedTotals = RecomputeTotals({ cart: rebuiltCart, creditValidations: createOrderRequest.creditValidations, fulfillment: fulfillmentConfig, totals: createOrderRequest.totals, order: orderInstance });
    if (createOrderRequest.totals.balance.amount !== recomputedTotals.balanceAfterCredits.amount) {
      const errorDetail = `Computed different balance of ${MoneyToDisplayString(recomputedTotals.balanceAfterCredits, true)} vs sent: ${MoneyToDisplayString(createOrderRequest.totals.balance, true)}`;
      logger.error(errorDetail)
      return { 
        status: 500, 
        success: false, 
        result: null,
        errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: errorDetail }]
      };
    }
    // we've only set the tip if we've proceeded to checkout with CC, so no need to check tip fudging if not closing out here
    if (createOrderRequest.nonce && createOrderRequest.totals.tip.amount < recomputedTotals.tipMinimum.amount) {
      const errorDetail = `Computed tip below minimum of ${MoneyToDisplayString(recomputedTotals.tipMinimum, true)} vs sent: ${MoneyToDisplayString(createOrderRequest.totals.tip, true)}`;
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
      // TODO: FIX THIS MESSAGE, for some reason it shows as no other options available even if there are.
      const display_time = DateTimeIntervalToDisplayServiceInterval(dateTimeInterval);
      const errorDetail = `Requested fulfillment (${fulfillmentConfig.displayName}) at ${display_time} is no longer valid. ${optionsForSelectedDate.length > 0 ? `Next available time for date selected is ${WDateUtils.MinutesToPrintTime(optionsForSelectedDate[0].value)}` : 'No times left for selected date.'}`;
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
    const discounts: OrderLineDiscount[] = [];
    const payments: OrderPayment[] = [];

    // Payment part A: attempt to process store credits, keep track of old store credit balance in case of failure
    const storeCreditResponses: ValidateLockAndSpendSuccess[] = [];
    let moneyCreditAmountLeft = recomputedTotals.giftCartApplied.amount;
    let discountCreditAmountLeft = recomputedTotals.discountApplied.amount;
    let creditProcessingFailed = false;
    try {
      await Promise.all(createOrderRequest.creditValidations.map(async (creditUse) => {
        // NOTE: we assume validation of the amount_used field in the RecomputeTotals method
        if (creditUse.amount_used.amount > 0 && creditUse.validation.valid) {
          const response = await StoreCreditProvider.ValidateLockAndSpend({ code: creditUse.code, amount: creditUse.amount_used, lock: creditUse.validation.lock, updatedBy: STORE_NAME })
          if (response.success) {
            storeCreditResponses.push(response);
            switch (creditUse.validation.credit_type) {
              case 'DISCOUNT':
                discountCreditAmountLeft -= creditUse.amount_used.amount;
                discounts.push({
                  status: TenderBaseStatus.COMPLETED,
                  t: DiscountMethod.CreditCodeAmount,
                  createdAt: Date.now(),
                  amount: creditUse.amount_used,
                  code: creditUse.code,
                  lock: creditUse.validation.lock
                });
                break;
              case 'MONEY':
                moneyCreditAmountLeft -= creditUse.amount_used.amount;
                payments.push({
                  status: TenderBaseStatus.COMPLETED,
                  t: PaymentMethod.StoreCredit,
                  createdAt: Date.now(),
                  amount: creditUse.amount_used,
                  code: creditUse.code,
                  lock: creditUse.validation.lock
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

    if (creditProcessingFailed || moneyCreditAmountLeft !== 0 || discountCreditAmountLeft !== 0) {
      // unwind storeCreditResponses
      await RefundStoreCreditDebits(storeCreditResponses);
      logger.error("Failed to process store credit step of ordering");
      return { status: 404, success: false, result: null, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: "Unable to debit store credit." }] };
    }

    if (recomputedTotals.balanceAfterCredits.amount === 0) {
      isPaid = true;
    }

    // Payment part B: attempt to charge balance to credit card
    let errors = [] as WError[];
    let hasChargingSucceeded = false;
    if (recomputedTotals.balanceAfterCredits.amount > 0 && createOrderRequest.nonce) {
      try {
        const response = await CreateSquareOrderAndCharge(reference_id, createOrderRequest.totals.balance, createOrderRequest.nonce, `This credit is applied to your order for: ${service_title}`);
        if (response.success) {
          payments.push(response.result);
          hasChargingSucceeded = true;
        }
        errors = response.error.map(e=>({category: e.category, code: e.code, detail: e.detail}));
      } catch (error: any) {
        logger.error(`Nasty error in processing payment: ${JSON.stringify(error)}.`);
        errors.push({ category: 'PAYMENT_METHOD_ERROR', detail: JSON.stringify(error), code: 'INTERNAL_SERVER_ERROR' });
        return { status: 500, success: false, result: null, errors };
      } finally {
        if (!hasChargingSucceeded && storeCreditResponses.length > 0) {
          await RefundStoreCreditDebits(storeCreditResponses);
        }
      }
      if (!hasChargingSucceeded) {
        return { status: 400, success: false, result: null, errors };
      }
      else {
        isPaid = true;
      }
    }

    // 6. send out emails and capture the order to persistent storage
    try {
      orderInstance = {
        cart: orderInstance.cart,
        customerInfo: orderInstance.customerInfo,
        fulfillment: orderInstance.fulfillment,
        metrics: orderInstance.metrics,
        refunds: [],
        payments,
        discounts,
        status: 'COMPLETED'
      };

      await new WOrderInstanceModel(orderInstance)
        .save()
        .then(async (dbOrderInstance) => {
          logger.info(`Successfully saved OrderInstance to database: ${JSON.stringify(dbOrderInstance.toJSON())}`)

          // TODO, need to actually test the failure of these service calls and some sort of retrying
          // for example, the event not created error happens, and it doesn't fail the service call. it should

          // create calendar event
          const orderCalendarEvent = CreateOrderEvent(
            menu,
            fulfillmentConfig,
            dbOrderInstance,
            rebuiltCart,
            createOrderRequest.specialInstructions,
            dateTimeInterval,
            isPaid,
            recomputedTotals);

          // send email to customer
          const createExternalEmailInfo = CreateExternalEmail(
            dbOrderInstance,
            fulfillmentConfig,
            service_title,
            rebuiltCart,
            createOrderRequest.specialInstructions,
            isPaid);

          // send email to eat(pie)
          const createInternalEmailInfo = CreateInternalEmail(
            dbOrderInstance,
            fulfillmentConfig,
            service_title,
            requestTime,
            dateTimeInterval,
            rebuiltCart,
            createOrderRequest.specialInstructions,
            isPaid,
            recomputedTotals,
            ipAddress);
          return { status: 200, success: true, result: dbOrderInstance.toObject() };
        });
    } catch (err) {
      throw err;
    }
  };

  Bootstrap = async () => {
    logger.info("Order Manager Bootstrap");
    logger.info("Order Manager Bootstrap completed.");
  };


}

const OrderManagerInstance = new OrderManager();
export default OrderManagerInstance;
module.exports = OrderManagerInstance;