import { ComputeCartSubTotal, CategorizedRebuiltCart, PRODUCT_LOCATION, WProduct, SERVICE_DATE_DISPLAY_FORMAT, WCPProductV2Dto, CreateProductWithMetadataFromV2Dto, CreateOrderRequestV2, FulfillmentDto, DeliveryInfoDto, MetricsDto, FilterWCPProduct, CoreCartEntry, ValidateAndLockCreditResponse, ComputeDiscountApplied, ComputeTaxAmount, ComputeTipBasis, ComputeTipValue, TotalsV2, ComputeTotal, ComputeGiftCardApplied, ComputeBalanceAfterCredits, JSFECreditV2, CreateOrderResponse, RoundToTwoDecimalPlaces } from "@wcp/wcpshared";
import { Error as SquareError} from 'square';

import { WProvider } from '../types/WProvider';

import { CreatePaymentResponse } from 'square';
import { formatRFC3339, format, parse, Interval, addDays, subMinutes, addMinutes, startOfDay, isSameMinute, isSameDay } from 'date-fns';
import GoogleProvider from "./google";
import SquareProvider from "./square";
import StoreCreditProvider from "./store_credit_provider";
import CatalogProviderInstance from './catalog_provider';
import DataProviderInstance from './dataprovider';
import logger from '../logging';
import { BigIntStringify } from "../utils";

const WCP = "Windy City Pie";
const DELIVERY_INTERVAL_TIME = 30;

const DISPLAY_TIME_FORMAT = "h:mma";

const IL_AREA_CODES = ["217", "309", "312", "630", "331", "618", "708", "773", "815", "779", "847", "224", "872"];
const MI_AREA_CODES = ["231", "248", "269", "313", "517", "586", "616", "734", "810", "906", "947", "989", "679"];

const BTP_AREA_CODES = IL_AREA_CODES.concat(MI_AREA_CODES);
const WCP_AREA_CODES = IL_AREA_CODES;

interface RecomputeTotalsArgs {
  cart: CategorizedRebuiltCart;
  creditResponse: ValidateAndLockCreditResponse | null;
  fulfillment: FulfillmentDto;
  totals: TotalsV2;
}

export interface RecomputeTotalsResult {
  mainCategoryProductCount: number;
  cartSubtotal: number;
  deliveryFee: number;
  subtotalBeforeDiscount: number;
  subtotalAfterDiscount: number;
  discountApplied: number;
  taxAmount: number;
  tipBasis: number;
  tipMinimum: number;
  total: number;
  giftCartApplied: number;
  balanceAfterCredits: number;
  tipAmount: number;
}

const GenerateShortCode = function (p: WProduct) {
  const pInstances = CatalogProviderInstance.Menu.product_classes[p.p.PRODUCT_CLASS.id].instances;
  return p.m.is_split && String(p.m.pi[PRODUCT_LOCATION.LEFT]) !== String(p.m.pi[PRODUCT_LOCATION.RIGHT]) ?
    `${pInstances[p.m.pi[PRODUCT_LOCATION.LEFT]].item.shortcode}|${pInstances[p.m.pi[PRODUCT_LOCATION.RIGHT]].item.shortcode}` :
    pInstances[p.m.pi[PRODUCT_LOCATION.LEFT]].item.shortcode;
}

const IsNativeAreaCode = function (phone: string, area_codes: string[]) {
  const numeric_phone = phone.match(/\d/g).join("");
  const area_code = numeric_phone.slice(0, 3);
  return (numeric_phone.length == 10 && area_codes.some(x => x === area_code));
};

const DateTimeIntervalBuilder = ({ selectedDate, selectedTime, selectedService }: Pick<FulfillmentDto, "selectedDate" | 'selectedService' | 'selectedTime'>) => {
  // hack for date computation on DST transition days since we're currently not open during the time jump
  const date_lower = subMinutes(addDays(selectedDate, 1), 1440 - selectedTime);
  // TODO NEED DELIVERY constant
  const date_upper = addMinutes(date_lower, selectedService === 2 ? DELIVERY_INTERVAL_TIME : 0);
  return { start: date_lower, end: date_upper } as Interval;
};

const DateTimeIntervalToDisplayServiceInterval = (interval: Interval) => {
  return isSameMinute(interval.start, interval.end) ? format(interval.start, DISPLAY_TIME_FORMAT) : `${format(interval.start, DISPLAY_TIME_FORMAT)} - ${format(interval.end, DISPLAY_TIME_FORMAT)}`;
}

const GenerateAutoResponseBodyEscaped = function (
  service_type_enum: number,
  date_time_interval: Interval,
  phone_number: string,
  delivery_info: DeliveryInfoDto | null,
  isPaid: boolean
) {
  const NOTE_PREPAID = "You've already paid, so unless there's an issue with the order, there's no need to handle payment from this point forward.";
  const NOTE_PAYMENT = "We happily accept any major credit card or cash for payment.";
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const PICKUP_INSTRUCTIONS = DataProviderInstance.KeyValueConfig.PICKUP_INSTRUCTIONS;
  const DINE_INSTRUCTIONS = DataProviderInstance.KeyValueConfig.DINE_INSTRUCTIONS;
  const DELIVERY_INSTRUCTIONS = DataProviderInstance.KeyValueConfig.DELIVERY_INSTRUCTIONS;
  const STORE_ADDRESS = DataProviderInstance.KeyValueConfig.STORE_ADDRESS;

  const service_instructions = [PICKUP_INSTRUCTIONS, DINE_INSTRUCTIONS, DELIVERY_INSTRUCTIONS];
  const nice_area_code = IsNativeAreaCode(phone_number, STORE_NAME === WCP ? WCP_AREA_CODES : BTP_AREA_CODES);
  const payment_section = isPaid ? NOTE_PREPAID : NOTE_PAYMENT;
  const display_time = DateTimeIntervalToDisplayServiceInterval(date_time_interval);
  const confirm = [`We're happy to confirm your ${display_time} pickup at`, `We're happy to confirm your ${display_time} order at`, `We're happy to confirm your delivery around ${display_time} at`];
  const where = [STORE_ADDRESS, STORE_ADDRESS, delivery_info?.validation.validated_address ?? "NOPE"];
  return encodeURIComponent(`${nice_area_code ? "Hey, nice area code!" : "Thanks!"} ${confirm[service_type_enum]} ${where[service_type_enum]}.\n\n${service_instructions[service_type_enum]} ${payment_section}`);
}

const GeneratePaymentSection = (totals: RecomputeTotalsResult, payment_info: CreatePaymentResponse | null, store_credit: JSFECreditV2 | null, ishtml: boolean) => {
  // TODO: check that these roundings are working properly and we don't need to switch to Math.round
  const discount = totals.discountApplied > 0 ? `\$${Number(totals.discountApplied).toFixed(2)}` : "";
  const tip_amount = `\$${Number(totals.tipAmount).toFixed(2)}`;
  const subtotal = `\$${Number(totals.subtotalAfterDiscount).toFixed(2)}`;
  const total_amount = "$" + Number(totals.total).toFixed(2);
  const store_credit_money_amount = totals.giftCartApplied > 0 ? `\$${Number(totals.giftCartApplied).toFixed(2)}` : "";
  const paid_by_credit_card = payment_info && payment_info.payment.totalMoney.amount ? "$" + Number(payment_info.payment.totalMoney.amount) / 100 : ""
  const receipt_url = payment_info ? payment_info.payment.receiptUrl : "";
  const discount_section = totals.discountApplied > 0 ? `NOTE BEFORE CLOSING OUT: Apply discount of ${discount}, pre-tax. Credit code used: ${store_credit.code}.${ishtml ? "<br />" : "\n"}` : "";
  const store_credit_money_section = store_credit_money_amount ? `Applied store credit value ${store_credit_money_amount} using code ${store_credit.code}.${ishtml ? "<br />" : "\n"}` : "";
  const card_payment_section = paid_by_credit_card ? `Paid ${paid_by_credit_card} by card ending in ${payment_info.payment.cardDetails.card.last4}.${ishtml ? "<br />" : "\n"}` : "";
  return ishtml ? `${discount_section}
  <p>Received payment of: <strong>${total_amount}</strong></p>
  <p>Pre-tax Amount: <strong>${subtotal}</strong><br />
  Tip Amount: <strong>${tip_amount}</strong><br />
  Confirm the above values in the <a href="${receipt_url}">receipt</a></p>${store_credit_money_section}${card_payment_section}` :
    `${discount_section}
  Received payment of: ${total_amount}
  Pre-tax Amount: ${subtotal}
  Tip Amount: ${tip_amount}
  Receipt: ${receipt_url}
  ${store_credit_money_section}${card_payment_section}`;
}

const GenerateDeliverySection = (delivery_info: DeliveryInfoDto | null, ishtml: boolean) => {
  if (delivery_info === null || !delivery_info.validation.validated_address) {
    return "";
  }
  const delivery_unit_info = delivery_info.address2 ? `, Unit info: ${delivery_info.address2}` : "";
  const delivery_instructions = delivery_info.deliveryInstructions ? `${ishtml ? "<br />" : "\n"}Delivery Instructions: ${delivery_info.deliveryInstructions}` : "";
  return `${ishtml ? "<p><strong>" : "\n"}Delivery Address:${ishtml ? "</strong>" : ""} ${delivery_info.validation.validated_address}${delivery_unit_info}${delivery_instructions}${ishtml ? "</p>" : ""}`;
}

const EventTitleStringBuilder = (service: number, customer: string, number_guests: number, cart: CategorizedRebuiltCart, special_instructions: string, sliced: boolean, ispaid: boolean) => {
  const SERVICE_SHORTHAND = ["P", "DINE", "DELIVER"]; // TODO: move to DB
  const service_string = SERVICE_SHORTHAND[service];
  const catalogCategories = CatalogProviderInstance.Catalog.categories;
  var has_special_instructions = special_instructions && special_instructions.length > 0;

  var titles: String[] = [];
  Object.entries(cart).forEach(([catid, category_cart]) => {
    const category = catalogCategories[catid].category;
    const call_line_category_name_with_space = category.display_flags && category.display_flags.call_line_name ? `${category.display_flags.call_line_name} ` : "";
    // TODO: this is incomplete since both technically use the shortcode for now. so we don't get modifiers in the call line
    // pending https://app.asana.com/0/1192054646278650/1192054646278651
    switch (category.display_flags.call_line_display) {
      case "SHORTCODE":
        var total = 0;
        var product_shortcodes: string[] = [];
        category_cart.forEach(item => {
          total += item.quantity;
          product_shortcodes = product_shortcodes.concat(Array(item.quantity).fill(GenerateShortCode(item.product)));
        });
        titles.push(`${total.toString(10)}x ${call_line_category_name_with_space}${product_shortcodes.join(" ")}`);
        break;
      default: //SHORTNAME
        var product_shortcodes: string[] = category_cart.map(item => `${item.quantity}x${GenerateShortCode(item.product)}`);
        titles.push(`${call_line_category_name_with_space}${product_shortcodes.join(" ")}`);
        break;
    }
  });
  return `${service_string}${sliced ? " SLICED" : ""} ${customer}${number_guests > 1 ? `+${number_guests - 1}` : ""} ${titles.join(" ")}${has_special_instructions ? " *" : ""}${ispaid ? " PAID" : " UNPAID"}`;
};

const ServiceTitleBuilder = (service_option_display_string: string, customer_name: string, number_guests: number, service_date: Date | number, service_time_interval: Interval) => {
  const display_service_time_interval = DateTimeIntervalToDisplayServiceInterval(service_time_interval);
  return `${service_option_display_string} for ${customer_name}${number_guests > 1 ? `+${number_guests - 1}` : ""} on ${format(service_date, SERVICE_DATE_DISPLAY_FORMAT)} at ${display_service_time_interval}`;
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

const GenerateShortCartFromFullCart = (cart: CategorizedRebuiltCart, sliced: boolean) => {
  // TODO: the sliced part of this is a hack. need to move to a modifier that takes into account the service type
  const catalogCategories = CatalogProviderInstance.Catalog.categories;
  return Object.entries(cart).map(([catid, category_cart]) => {
    if (category_cart.length > 0) {
      const category_name = catalogCategories[catid].category.name;
      const category_shortcart = { category_name: category_name, products: category_cart.map(x => `${x.quantity}x: ${x.product.m.shortname}${sliced && category_name === "Pizza" ? " SLICED" : ""}`) };
      return category_shortcart;
    }
  })
}

const RebuildOrderState = function (cart: CoreCartEntry<WCPProductV2Dto>[], service_time: Date | number) {
  const menu = CatalogProviderInstance.Menu;
  const catalogCategories = CatalogProviderInstance.Catalog.categories;
  const noLongerAvailable: CoreCartEntry<WCPProductV2Dto>[] = [];

  const rebuiltCart: CategorizedRebuiltCart = cart.reduce(
    (acc, entry) => {
      const product = CreateProductWithMetadataFromV2Dto(entry.product, menu, service_time);
      if (!FilterWCPProduct(product.p, menu, service_time) || !Object.hasOwn(catalogCategories, entry.categoryId)) {
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


const RecomputeTotals = function ({ cart, creditResponse, fulfillment, totals }: RecomputeTotalsArgs): RecomputeTotalsResult {
  const cfg = DataProviderInstance.Settings.config;
  const MAIN_CATID = cfg.MAIN_CATID as string;
  const DELIVERY_FEE = cfg.DELIVERY_FEE as number;
  const TAX_RATE = cfg.TAX_RATE as number;
  const AUTOGRAT_THRESHOLD = cfg.AUTOGRAT_THRESHOLD as number;

  const mainCategoryProductCount = Object.hasOwn(cart, MAIN_CATID) ? cart[MAIN_CATID].reduce((acc, e) => acc + e.quantity, 0) : 0;
  const cartSubtotal = Object.values(cart).reduce((acc, c) => acc + ComputeCartSubTotal(c), 0);
  const deliveryFee = fulfillment.deliveryInfo !== null && fulfillment.deliveryInfo.validation.validated_address ? DELIVERY_FEE : 0;
  const subtotalBeforeDiscount = cartSubtotal + deliveryFee;
  const discountApplied = ComputeDiscountApplied(subtotalBeforeDiscount, creditResponse);
  const taxAmount = ComputeTaxAmount(subtotalBeforeDiscount, TAX_RATE, discountApplied);
  const tipBasis = ComputeTipBasis(subtotalBeforeDiscount, taxAmount);
  const subtotalAfterDiscount = RoundToTwoDecimalPlaces(subtotalBeforeDiscount - discountApplied);
  const tipMinimum = mainCategoryProductCount >= AUTOGRAT_THRESHOLD ? ComputeTipValue({ isPercentage: true, isSuggestion: true, value: .2 }, tipBasis) : 0;
  const tipAmount = totals.tip;
  const total = ComputeTotal(subtotalBeforeDiscount, discountApplied, taxAmount, tipAmount);
  const giftCartApplied = ComputeGiftCardApplied(total, creditResponse);
  const balanceAfterCredits = ComputeBalanceAfterCredits(total, giftCartApplied);
  return {
    mainCategoryProductCount,
    cartSubtotal,
    deliveryFee,
    subtotalBeforeDiscount,
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
  service_type_enum: number,
  service_title: string,
  customer_name: string,
  number_guests: number,
  service_date: Date | number,
  date_time_interval: Interval,
  phonenum: string,
  user_email: string,
  delivery_info: DeliveryInfoDto | null,
  cart: CategorizedRebuiltCart,
  sliced: boolean,
  referral: string,
  special_instructions: string,
  website_metrics: MetricsDto,
  isPaid: boolean,
  totals: RecomputeTotalsResult,
  payment_info: CreatePaymentResponse,
  store_credit: JSFECreditV2,
  ipAddress: string) => {

  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;

  const confirmation_body_escaped = GenerateAutoResponseBodyEscaped(service_type_enum, date_time_interval, phonenum, delivery_info, isPaid)
  const confirmation_subject_escaped = encodeURIComponent(service_title);
  const payment_section = isPaid ? GeneratePaymentSection(totals, payment_info, store_credit, true) : "";
  const delivery_section = GenerateDeliverySection(delivery_info, true);
  const shortcart = GenerateShortCartFromFullCart(cart, sliced);
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "<br />Special Instructions: " + special_instructions : "";
  const emailbody = `<p>From: ${customer_name} ${user_email}</p>${number_guests > 1 ? `<strong>Number Guests:</strong> ${number_guests}<br \>` : ""}
<p>${shortcart.map(x => `<strong>${x.category_name}:</strong><br />${x.products.join("<br />")}`).join("<br />")}
${special_instructions_section}<br />
Phone: ${phonenum}</p>
${isSameDay(Date.now(), service_date) ? "" : '<strong style="color: red;">DOUBLE CHECK THIS IS FOR TODAY BEFORE SENDING THE TICKET</strong> <br />'}
Auto-respond: <a href="mailto:${user_email}?subject=${confirmation_subject_escaped}&body=${confirmation_body_escaped}">Confirmation link</a><br />
    
<p>Referral Information: ${referral}</p>

${delivery_section}    

${payment_section}

<p>Debug info:<br />
Load: ${website_metrics.pageLoadTime}<br />
Time select: ${website_metrics.timeToServiceTime}<br />
Submit: ${website_metrics.submitTime}<br />
User IP: ${ipAddress}<br />
<p>Useragent: ${website_metrics.useragent}</p>`;
  await GoogleProvider.SendEmail(
    {
      name: customer_name,
      address: EMAIL_ADDRESS
    },
    EMAIL_ADDRESS,
    service_title + (isPaid ? " *ORDER PAID*" : " _UNPAID_"),
    user_email,
    emailbody);
}

const CreateExternalEmail = async (
  service_option_enum: number,
  service_title: string,
  phonenum: string,
  user_email: string,
  cart: CategorizedRebuiltCart,
  special_instructions: string,
  delivery_info: DeliveryInfoDto | null,
  isPaid: boolean,
  payment_info: CreatePaymentResponse | null
) => {
  const EMAIL_ADDRESS = DataProviderInstance.KeyValueConfig.EMAIL_ADDRESS;
  const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
  const ORDER_RESPONSE_PREAMBLE = DataProviderInstance.KeyValueConfig.ORDER_RESPONSE_PREAMBLE;
  const LOCATION_INFO = DataProviderInstance.KeyValueConfig.LOCATION_INFO;

  const NON_DELIVERY_AUTORESPONSE = "We'll get back to you shortly to confirm your order.";
  const DELIVERY_BETA_AUTORESPONSE = "Our delivery service is now in beta. Delivery times are rough estimates and we will make every attempt to be prompt. We'll contact you to confirm the order shortly.";
  const automated_instructions = service_option_enum == 2 ? DELIVERY_BETA_AUTORESPONSE : NON_DELIVERY_AUTORESPONSE;
  const cartstring = GenerateDisplayCartStringListFromProducts(cart);
  const delivery_section = GenerateDeliverySection(delivery_info, true);
  const location_section = delivery_section ? "" : `<p><strong>Location Information:</strong>
We are located ${LOCATION_INFO}</p>`;
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "<p><strong>Special Instructions</strong>: " + special_instructions + "</p>" : "";
  const emailbody = `<p>${ORDER_RESPONSE_PREAMBLE}</p>
<p>We take your health seriously; be assured your order has been prepared with the utmost care.</p>
<p>Note that all gratuity is shared with the entire ${STORE_NAME} family.</p>
<p>${automated_instructions}</p>
<p>Please take some time to ensure the details of your order as they were entered are correct. If the order is fine, there is no need to respond to this message. If you need to make a correction or have a question, please respond to this message as soon as possible.</p>
    
<b>Order information:</b><br />
Service: ${service_title}.<br />
Phone: ${phonenum}<br />
Order contents:<br />
${cartstring.join("<br />")}
${special_instructions_section}
${delivery_section}
${isPaid && payment_info ? `<br /><a href="${payment_info.payment.receiptUrl}">Here's a link to your receipt!</a>` : ""}
${location_section}We thank you for your support!`;
  return await GoogleProvider.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    user_email,
    service_title,
    EMAIL_ADDRESS,
    emailbody);
}

const CreateOrderEvent = async (
  service_option_enum: number,
  customer_name: string,
  number_guests: number,
  phone_number: string,
  cart: CategorizedRebuiltCart,
  special_instructions: string,
  sliced: boolean,
  service_time_interval: Interval,
  delivery_info: DeliveryInfoDto | null,
  isPaid: boolean,
  totals: RecomputeTotalsResult,
  payment_info: CreatePaymentResponse | null,
  store_credit: JSFECreditV2 | null) => {
  const shortcart = GenerateShortCartFromFullCart(cart, sliced);
  const calendar_event_title = EventTitleStringBuilder(service_option_enum, customer_name, number_guests, cart, special_instructions, sliced, isPaid);
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "\nSpecial Instructions: " + special_instructions : "";
  const number_guests_section = number_guests > 1 ? `Number Guests: ${number_guests}\n` : "";
  const payment_section = isPaid ? "\n" + GeneratePaymentSection(totals, payment_info, store_credit, false) : "";
  const delivery_section = GenerateDeliverySection(delivery_info, false);
  const calendar_details = `${shortcart.map(x => `${x.category_name}:\n${x.products.join("\n")}`).join("\n")}\n${number_guests_section}ph: ${phone_number}${special_instructions_section}${delivery_section}${payment_section}`;

  return await GoogleProvider.CreateCalendarEvent(calendar_event_title,
    delivery_info?.validation.validated_address ?? "",
    calendar_details,
    {
      dateTime: formatRFC3339(service_time_interval.start),
      timeZone: "America/Los_Angeles"
    },
    {
      dateTime: formatRFC3339(service_time_interval.end),
      timeZone: "America/Los_Angeles"
    });
}

const CreateSquareOrderAndCharge = async (reference_id: string, balance: number, nonce: string, note: string) => {
  const amount_to_charge = Math.round(balance * 100);
  const create_order_response = await SquareProvider.CreateOrderStoreCredit(reference_id, BigInt(amount_to_charge), note);
  if (create_order_response.success === true) {
    const square_order_id = create_order_response.result.order.id;
    logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${amount_to_charge}`)
    const payment_response = await SquareProvider.ProcessPayment(nonce, BigInt(amount_to_charge), reference_id, square_order_id);
    if (payment_response.success === false) {
      logger.error("Failed to process payment: %o", payment_response);
      await SquareProvider.OrderStateChange(square_order_id, create_order_response.result.order.version + 1, "CANCELED");
      return payment_response;
    }
    else {
      logger.info(`For internal id ${reference_id} and Square Order ID: ${square_order_id} payment for ${amount_to_charge} successful.`)
      return payment_response;
    }
  }
  logger.error(create_order_response);
  return create_order_response;
}

export class OrderManager implements WProvider {
  constructor() {
  }

  public CreateOrder = async ({
    nonce,
    customerInfo,
    fulfillmentDto,
    sliced,
    cart,
    special_instructions,
    totals,
    store_credit,
    metrics }: CreateOrderRequestV2, ipAddress: string ) : Promise<CreateOrderResponse & { status: number }> => {
    
    const STORE_NAME = DataProviderInstance.KeyValueConfig.STORE_NAME;
    const reference_id = Date.now().toString(36).toUpperCase();
    const service_date = startOfDay(fulfillmentDto.selectedDate);
    const service_option_display_string = DataProviderInstance.Services[fulfillmentDto.selectedService];
    const customer_name = [customerInfo.givenName, customerInfo.familyName].join(" ");
    const date_time_interval = DateTimeIntervalBuilder(fulfillmentDto);
    const { noLongerAvailable, rebuiltCart } = RebuildOrderState(cart, date_time_interval.start);
    if (noLongerAvailable.length > 0) {
      return { status: 404, success: false, result: { errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'GONE', detail: "Unable to rebuild order from current catalog data." }] } };
    }
    const recomputedTotals = RecomputeTotals({ cart: rebuiltCart, creditResponse: store_credit?.validation ?? null, fulfillment: fulfillmentDto, totals });
    if (totals.balance !== recomputedTotals.balanceAfterCredits) {
      const errorDetail = `Computed different balance of ${recomputedTotals.balanceAfterCredits} vs sent: ${totals.balance}`;
      logger.error(errorDetail)
      return { status: 500, success: false, result: { errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail : errorDetail }]}};
    }
    if (totals.tip < recomputedTotals.tipMinimum) {
      const errorDetail = `Computed tip below minimum of ${recomputedTotals.tipMinimum} vs sent: ${totals.tip}`;
      logger.error(errorDetail)
      return { status: 500, success: false, result: { errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail : errorDetail }]}};
    }
    const numGuests = fulfillmentDto.dineInInfo?.partySize ?? 1;
    const service_title = ServiceTitleBuilder(service_option_display_string, customer_name, numGuests, service_date, date_time_interval);

    let isPaid = false;

    // step 1: attempt to process store credit, keep track of old store credit balance in case of failure
    let store_credit_response;
    if (store_credit !== null && store_credit.amount_used > 0) {
      store_credit_response = await StoreCreditProvider.ValidateLockAndSpend({ code: store_credit.code, amount: store_credit.amount_used, lock: store_credit.validation.lock, updatedBy: STORE_NAME });
      if (!store_credit_response.success) {
        logger.error("Failed to process store credit step of ordering");
        return { status: 404, success: false, result: { errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'INSUFFICIENT_FUNDS', detail: "Unable to debit store credit." }] } };
      }
    }

    if (recomputedTotals.balanceAfterCredits === 0) {
      isPaid = true;
    }

    // step 2: attempt to charge balance to credit card
    let hasChargingSucceeded = false;
    let chargingResponse = null;
    let errors = [] as SquareError[];
    if (totals.balance > 0 && nonce) {
      try {
        const response = await CreateSquareOrderAndCharge(reference_id, totals.balance, nonce, `This credit is applied to your order for: ${service_title}`);
        hasChargingSucceeded = response.success;
        chargingResponse = response.result;
        errors = response.error;
      } catch (error: any) {
        logger.error(`Nasty error in processing payment: ${BigIntStringify(error)}.`);
        errors.push({ category: 'PAYMENT_METHOD_ERROR', detail: BigIntStringify(error), code: 'INTERNAL_SERVER_ERROR' });
        return { status: 500, success: false, result: { errors } };
      } finally {
        if (!hasChargingSucceeded && store_credit !== null && store_credit.amount_used > 0) {
          logger.info(`Refunding ${store_credit.code} after failed credit card payment.`);
          await StoreCreditProvider.CheckAndRefundStoreCredit(store_credit_response.entry, store_credit_response.index);
        }
      } 
      if (!hasChargingSucceeded) {
        return { status: 400, success: false, result: { errors } };
      }
      else {
        isPaid = true;
      }
    }

    try {
      var service_calls: Promise<any>[] = [];
      // TODO, need to actually test the failure of these service calls and some sort of retrying
      // for example, the event not created error happens, and it doesn't fail the service call. it should
      // send email to customer
      service_calls.push(CreateExternalEmail(
        fulfillmentDto.selectedService,
        service_title,
        customerInfo.mobileNum,
        customerInfo.email,
        rebuiltCart,
        special_instructions,
        fulfillmentDto.deliveryInfo,
        isPaid,
        chargingResponse));

      // send email to eat(pie)
      service_calls.push(CreateInternalEmail(
        fulfillmentDto.selectedService,
        service_title,
        customer_name,
        numGuests,
        service_date,
        date_time_interval,
        customerInfo.mobileNum,
        customerInfo.email,
        fulfillmentDto.deliveryInfo,
        rebuiltCart,
        sliced,
        customerInfo.referral,
        special_instructions,
        metrics,
        isPaid,
        recomputedTotals,
        chargingResponse,
        store_credit,
        ipAddress
      ));
      service_calls.push(CreateOrderEvent(
        fulfillmentDto.selectedService,
        customer_name,
        numGuests,
        customerInfo.mobileNum,
        rebuiltCart,
        special_instructions,
        sliced,
        date_time_interval,
        fulfillmentDto.deliveryInfo,
        isPaid,
        recomputedTotals,
        chargingResponse,
        store_credit
      ));
      await Promise.all(service_calls);
      // at this point hasChargingSucceeded just indicates if we kicked the charge off at all
      // TODO: we need to differentiate between a response that didn't charge due to using store credit and one that didn't charge due to special instructions or whatever
      // the store credit payment response should be sent back to the caller, probably just via the square order info?
      return { status: 200, success: true, result: hasChargingSucceeded === true ? chargingResponse : null };
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