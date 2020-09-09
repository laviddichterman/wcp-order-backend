// submit an order
const Router = require('express').Router
const moment = require('moment');
const { body, validationResult } = require('express-validator');
const GoogleProvider = require("../../../../config/google");
const SquareProvider = require("../../../../config/square");
const wcpshared = require("@wcp/wcpshared");
const WCP = "Windy City Pie";
const DELIVERY_INTERVAL_TIME = 30;

const GOOGLE_EVENTS_DATETIME_FORMAT = "YYYY-MM-DDTHH:mm:ss";
const DISPLAY_TIME_FORMAT = "h:mmA";
const DISPLAY_DATE_FORMAT = "dddd, MMMM DD, Y";

const WCP_ADDRESS = "5918 Phinney Ave N, 98103";
const BTP_ADDRESS = "4864 Beacon Ave S, 98108";

const IL_AREA_CODES = ["217", "309", "312", "630", "331", "618", "708", "773", "815", "779", "847", "224", "872"];
const MI_AREA_CODES = ["231", "248", "269", "313", "517", "586", "616", "734", "810", "906", "947", "989", "679"];

const BTP_AREA_CODES = IL_AREA_CODES.concat(MI_AREA_CODES);
const WCP_AREA_CODES = IL_AREA_CODES;

const IsNativeAreaCode = function (phone, area_codes) {
  const numeric_phone = phone.match(/\d/g).join("");
  const area_code = numeric_phone.slice(0, 3);
  return (numeric_phone.length == 10 && area_codes.some(x => x == area_code));
};

const DateTimeIntervalBuilder = (date, time, service_type) => {
  var date_lower = moment(date).add(time, "minutes");
  var date_upper = moment(date_lower);
  // TODO NEED DELIVERY constant
  if (service_type === 2) {
    date_upper = date_upper.add(DELIVERY_INTERVAL_TIME, "minutes")
  }
  return [date_lower, date_upper];
};

const DateTimeIntervalToDisplayServiceInterval = (interval) => {
  return interval[0].isSame(interval[1], "minute") ? interval[0].format(DISPLAY_TIME_FORMAT) : `${interval[0].format(DISPLAY_TIME_FORMAT)} - ${interval[1].format(DISPLAY_TIME_FORMAT)}`;
}

const GenerateAutoResponseBodyEscaped = function(
  STORE_NAME,
  service_type_enum, 
  date_time_interval,
  phone_number, 
  delivery_info,
  isPaid
) {
  const WCP_PICKUP_INSTRUCTIONS = "Come to the door and we'll greet you. If there is a line, please form alongside the patio. Please maintain a 6 foot distance between yourself, our team, and other patrons at all times.";
  const BTP_PICKUP_INSTRUCTIONS = "We are currently offering curbside pick-up. We will have someone available to assist you at the front door when you arrive. Please maintain a 6 foot distance between yourself, our team, and other patrons at all times.";

  const BTP_DINE_IN = "Please arrive promptly with your entire party. Someone will be at the front door to greet you and check your party in. Beverages will be available through our friends at Clock-Out Lounge."
  const WCP_DINE_IN = "Dine-ins get you to the front of the table queue. We don't reserve seating. Please arrive slightly before your selected time so your pizza is as fresh as possible and you have time to get situated and get beverages!";
  const NOTE_DELIVERY_SERVICE = "We appreciate your patience as our in-house delivery service is currently in its infancy. Delivery times are estimated. We might be a little earlier, or a little later.";

  const NOTE_PREPAID = "You've already paid, so unless there's an issue with the order, there's no need to handle payment from this point forward.";
  const NOTE_PAYMENT = "We happily accept any major credit card or cash for payment upon arrival.";

  const store_address = STORE_NAME === WCP ? WCP_ADDRESS : BTP_ADDRESS;
  const pickup_instructions = STORE_NAME === WCP ? WCP_PICKUP_INSTRUCTIONS : BTP_PICKUP_INSTRUCTIONS;
  const dinein_instructions = STORE_NAME === WCP ? WCP_DINE_IN : BTP_DINE_IN;
  const service_instructions = [pickup_instructions, dinein_instructions, NOTE_DELIVERY_SERVICE];
  const nice_area_code = IsNativeAreaCode(phone_number, STORE_NAME === WCP ? WCP_AREA_CODES : BTP_AREA_CODES);
  const payment_section = isPaid ? NOTE_PREPAID : NOTE_PAYMENT;
  const display_time = DateTimeIntervalToDisplayServiceInterval(date_time_interval);
  const confirm = [`We're happy to confirm your ${display_time} pickup at`, `We're happy to confirm your ${display_time} order at`, `We're happy to confirm your delivery around ${display_time} at`];
  const where = [store_address, store_address, delivery_info.validated_delivery_address];
  return encodeURI(`${nice_area_code ? "Hey, nice area code!" : "Thanks!"} ${confirm[service_type_enum]} ${where[service_type_enum]}.\n\n${service_instructions[service_type_enum]} ${payment_section}`);
}

const GeneratePaymentSection = (totals, payment_info, store_credit, ishtml) => {
  const discount = store_credit && store_credit.type == "DISCOUNT" ? `\$${Number(store_credit.amount_used).toFixed(2)}` : "";
  const base_amount = "$" + Number(totals.total - totals.tip).toFixed(2);
  const tip_amount = "$" + Number(totals.tip).toFixed(2);
  const total_amount = "$" + Number(totals.total).toFixed(2);
  const store_credit_money_amount = store_credit && store_credit.type == "MONEY" && store_credit.amount_used ? "$" + Number(store_credit.amount_used).toFixed(2) : "";
  const paid_by_credit_card = payment_info && payment_info.result.payment.total_money.amount ? "$" + payment_info.result.payment.total_money.amount/100 : ""
  const receipt_url = payment_info ? payment_info.result.payment.receipt_url : "";
  const discount_section = discount ? `NOTE BEFORE CLOSING OUT: Apply discount of ${discount}, pre-tax. Credit code used: ${store_credit.code}.${ishtml ? "<br />" : "\n"}` : "";
  const store_credit_money_section = store_credit_money_amount ? `Applied store credit value ${store_credit_money_amount} using code ${store_credit.code}.${ishtml ? "<br />" : "\n"}` : "";
  const card_payment_section = paid_by_credit_card ? `Paid ${paid_by_credit_card} by card ending in ${payment_info.result.payment.card_details.card.last_4}.${ishtml ? "<br />" : "\n"}` : "";
  return ishtml ? `${discount_section}
  <p>Received payment of: <strong>${total_amount}</strong></p>
  <p>Base Amount: <strong>${base_amount}</strong><br />
  Tip Amount: <strong>${tip_amount}</strong><br />
  Confirm the above values in the <a href="${receipt_url}">receipt</a></p>${store_credit_money_section}${card_payment_section}` :
    `${discount_section}
  Received payment of: ${total_amount}
  Base Amount: ${base_amount}
  Tip Amount: ${tip_amount}
  Receipt: ${receipt_url}
  ${store_credit_money_section}${card_payment_section}`;
}

const GenerateDeliverySection = (delivery_info, ishtml) => {
  if (!delivery_info.validated_delivery_address) {
    return "";
  }
  const delivery_unit_info = delivery_info.address2 ? `, Unit info: ${delivery_info.address2}` : "";
  const delivery_instructions = delivery_info.instructions ? `${ishtml ? "<br />" : "\n"}Delivery Instructions: ${delivery_info.instructions}` : "";
  return `${ishtml ? "<p><strong>" : "\n"}Delivery Address:${ishtml ? "</strong>":""} ${delivery_info.validated_delivery_address}${delivery_unit_info}${delivery_instructions}${ishtml ? "</p>" : ""}`;
}

const EventTitleStringBuilder = (CATALOG, service, customer, cart, special_instructions, sliced, ispaid) => {
  const SERVICE_SHORTHAND = ["P", "DINE", "DELIVER"]; // TODO: move to DB
  const service_string = SERVICE_SHORTHAND[service];

  var has_special_instructions = special_instructions && special_instructions.length > 0;

  var titles = [];
  cart.forEach(category_cart => {
    const catid = category_cart.category;
    if (!CATALOG.categories.hasOwnProperty(category_cart.category)) {
      throw "Cannot find category in the catalog!";
    }
    const category = CATALOG.categories[category_cart.category].category;
    const call_line_category_name_with_space = category.display_flags && category.display_flags.call_line_name ? `${category.display_flags.call_line_name} ` : ""; 
    // TODO: this is incomplete since both technically use the shortcode for now. so we don't get modifiers in the call line
    // pending https://app.asana.com/0/1192054646278650/1192054646278651
    switch(category.display_flags.call_line_display ?? "SHORTNAME") {
      case "SHORTCODE": 
        var total = 0;
        var product_shortcodes = [];
        category_cart.items.forEach(item => {
          total += item.quantity;
          product_shortcodes = product_shortcodes.concat(Array(item.quantity).fill(item.product.shortcode));
        });    
        titles.push(`${total.toString(10)}x ${call_line_category_name_with_space}${product_shortcodes.join(" ")}`);
        break; 
      default: //SHORTNAME
        var product_shortcodes = category_cart.items.map(item => `${item.quantity}x${item.product.shortcode}`);
        titles.push(`${call_line_category_name_with_space}${product_shortcodes.join(" ")}`);
        break; 
    }
  });
  return `${service_string}${sliced ? " SLICED" : ""} ${customer} ${titles.join(" ")}${has_special_instructions ? " *" : ""}${ispaid ? " PAID" : " UNPAID"}`;
};

const ServiceTitleBuilder = (service_option_display_string, customer_name, service_date, service_time_interval) => {
  const display_service_time_interval = DateTimeIntervalToDisplayServiceInterval(service_time_interval);
  return `${service_option_display_string} for ${customer_name} on ${service_date.format(DISPLAY_DATE_FORMAT)} at ${display_service_time_interval}`;
}

const GenerateDisplayCartStringListFromProducts = (cart) => {
  const display_cart_string_list = [];
  cart.forEach((category_cart) => {
    category_cart.items.forEach((item) => {
      display_cart_string_list.push(`${item.quantity}x: ${item.product.name}`)
    });
  });
  return display_cart_string_list;
}

const GenerateShortCartFromFullCart = (cart, catalog, sliced) => {
  // TODO: the sliced part of this is a hack. need to move to a modifier that takes into account the service type
  const short_cart = [];
  cart.forEach((category_cart) => {
    if (!catalog.categories.hasOwnProperty(category_cart.category)) {
      throw "Cannot find category in the catalog!";
    }
    if (category_cart.items.length > 0) {
      const category_name = catalog.categories[category_cart.category].category.name;
      const category_shortcart = { category_name: category_name, products: category_cart.items.map(x => `${x.quantity}x: ${x.product.shortname}${sliced && category_name === "Pizza" ? " SLICED" : ""}`) };
      short_cart.push(category_shortcart);
    }
  })
  return short_cart;
}

const RebuildOrderFromDTO = (menu, cart) => {
  const newcart = [];
  for (var cid in cart) {
    //[<quantity, {pid, modifiers: {MID: <placement, OID>} } >]
    const items = [];
    cart[cid].forEach((entry) => {
      const [quantity, product_dto] = entry;
      const product = wcpshared.WCPProductFromDTO(product_dto, menu);
      product.Initialize(menu);
      items.push({ quantity, product });
    });
    newcart.push({category: cid, items: items });
  }
  return newcart;
}

const CreateInternalEmail = (
  STORE_NAME,
  EMAIL_ADDRESS,
  CATALOG,
  service_type_enum,
  service_title,
  customer_name,
  service_date, // moment
  date_time_interval,
  phonenum,
  user_email,
  delivery_info,
  cart,
  sliced,
  referral,
  special_instructions,
  website_metrics,
  isPaid,
  totals,
  payment_info,
  store_credit) => {
  const confirmation_body_escaped = GenerateAutoResponseBodyEscaped(STORE_NAME, service_type_enum, date_time_interval, phonenum, delivery_info, isPaid)
  const confirmation_subject_escaped = encodeURI(service_title);
  const payment_section = isPaid ? GeneratePaymentSection(totals, payment_info, store_credit, true) : "";
  const delivery_section = GenerateDeliverySection(delivery_info, true);
  const shortcart = GenerateShortCartFromFullCart(cart, CATALOG, sliced);
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "<br />Special Instructions: " + special_instructions : "";
  const emailbody = `<p>From: ${customer_name} ${user_email}</p>
<p>${shortcart.map(x=> `<strong>${x.category_name}:</strong><br />${x.products.join("<br />")}`).join("<br />")}
${special_instructions_section}<br />
Phone: ${phonenum}</p>
${moment().isSame(service_date, "day") ? "" : '<strong style="color: red;">DOUBLE CHECK THIS IS FOR TODAY BEFORE SENDING THE TICKET</strong> <br />'}
Auto-respond: <a href="mailto:${user_email}?subject=${confirmation_subject_escaped}&body=${confirmation_body_escaped}">Confirmation link</a><br />
    
<p>Referral Information: ${referral}</p>

${delivery_section}    

${payment_section}

<p>Debug info:<br />
Load: ${website_metrics.load_time}<br />
Time select: ${website_metrics.time_selection_time}<br />
Submit: ${website_metrics.time_submit}<br />
<p>Useragent: ${website_metrics.ua}</p>`;
  GoogleProvider.SendEmail(
    {
      name: customer_name,
      address: EMAIL_ADDRESS
    },
    EMAIL_ADDRESS,
    service_title + (isPaid ? " *ORDER PAID*" : " _UNPAID_"),
    user_email,
    emailbody);
}

const CreateExternalEmail = (
  STORE_NAME,
  EMAIL_ADDRESS,
  service_option_enum,
  service_title,
  phonenum,
  user_email,
  cart,
  special_instructions,
  delivery_info,
  isPaid,
  payment_info
) => {
  const NON_DELIVERY_AUTORESPONSE = "We'll get back to you shortly to confirm your order.";
  const DELIVERY_BETA_AUTORESPONSE = "Our delivery service is now in beta. Delivery times are rough estimates and we will make every attempt to be prompt. We'll contact you to confirm the order shortly.";
  const WCP_ORDER_RESPONSE_PREAMBLE = "<p>Thanks so much for ordering Seattle's best Chicago-style pan deep-dish pizza!</p>"
  const BTP_ORDER_RESPONSE_PREAMBLE = `<p>Thanks so much for ordering Seattle's best Chicago-ish, Detroit-ish, pan deep-dish pizza!</p>`
  const WCP_LOCATION_INFO = `at (<a href="http://bit.ly/WindyCityPieMap">${WCP_ADDRESS}</a>).`;
  const BTP_LOCATION_INFO = `inside Clock-Out Lounge (<a href="http://bit.ly/BreezyTownAtClockOut">${BTP_ADDRESS}</a>).`;

  const automated_instructions = service_option_enum == 2 ? DELIVERY_BETA_AUTORESPONSE : NON_DELIVERY_AUTORESPONSE;
  const preamble = STORE_NAME === WCP ? WCP_ORDER_RESPONSE_PREAMBLE : BTP_ORDER_RESPONSE_PREAMBLE;
  const location_info = STORE_NAME === WCP ? WCP_LOCATION_INFO : BTP_LOCATION_INFO;
  const cartstring = GenerateDisplayCartStringListFromProducts(cart);
  const delivery_section = GenerateDeliverySection(delivery_info, true);
  const location_section = delivery_section ? "" : `<p><strong>Location Information:</strong>
We are located ${location_info}</p>`;
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "<p><strong>Special Instructions</strong>: " + special_instructions  + "</p>": "";
  const emailbody = `${preamble}
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
${isPaid && payment_info ? `<br /><a href="${payment_info.result.payment.receipt_url}">Here's a link to your receipt!</a>` : ""}
${location_section}We thank you for your take-out and delivery business at this time.`;
  GoogleProvider.SendEmail(
    {
      name: STORE_NAME,
      address: EMAIL_ADDRESS
    },
    user_email,
    service_title,
    EMAIL_ADDRESS,
    emailbody);
}

const CreateOrderEvent = (
  CATALOG,
  service_option_enum,
  customer_name,
  phone_number,
  cart,
  special_instructions,
  sliced,
  service_time_interval,
  delivery_info,
  isPaid,
  totals,
  payment_info,
  store_credit) => {
  const shortcart = GenerateShortCartFromFullCart(cart, CATALOG, sliced);
  const calendar_event_title = EventTitleStringBuilder(CATALOG, service_option_enum, customer_name, cart, special_instructions, sliced, isPaid);
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "\nSpecial Instructions: " + special_instructions : "";
  const payment_section = isPaid ? "\n" + GeneratePaymentSection(totals, payment_info, store_credit, false) : "";
  const delivery_section = GenerateDeliverySection(delivery_info, false);
  const calendar_details = `${shortcart.map(x=> `${x.category_name}:\n${x.products.join("\n")}`).join("\n")}\nph: ${phone_number}${special_instructions_section}${delivery_section}${payment_section}`;

  return GoogleProvider.CreateCalendarEvent(calendar_event_title,
    delivery_info.validated_delivery_address ? delivery_info.validated_delivery_address : "",
    calendar_details,
    { dateTime: service_time_interval[0].format(GOOGLE_EVENTS_DATETIME_FORMAT),
      timeZone: "America/Los_Angeles"
     },
    { dateTime: service_time_interval[1].format(GOOGLE_EVENTS_DATETIME_FORMAT),
      timeZone: "America/Los_Angeles"
     });
}

const CheckAndSpendStoreCredit = async (logger, STORE_CREDIT_SHEET, store_credit) => {
  const range = "CurrentWARIO!A2:M";
  const values = await GoogleProvider.GetValuesFromSheet(STORE_CREDIT_SHEET, range);
  for (let i = 0; i < values.values.length; ++i) {
    const entry = values.values[i];
    if (entry[7] == store_credit.code) {
      const credit_balance = parseFloat(Number(entry[3]).toFixed(2));
      if (store_credit.amount_used > credit_balance) {
        logger.error(`We have a cheater folks, store credit key ${entry[7]}, attempted to use ${store_credit.amount_used} but had balance ${credit_balance}`);
        return [false, [], 0];
      }
      if (entry[10] != store_credit.encoded.enc ||
        entry[11] != store_credit.encoded.iv || 
        entry[12] != store_credit.encoded.auth) {
        logger.error(`WE HAVE A CHEATER FOLKS, store credit key ${entry[7]}, expecting encoded: ${JSON.stringify(store_credit.encoded)}.`);
        return [false, [], 0];
      }
      if (entry[8] && moment(entry[8], wcpshared.DATE_STRING_INTERNAL_FORMAT).isBefore(moment(), "day")) {
        logger.error(`We have a cheater folks, store credit key ${entry[7]}, attempted to use after expiration of ${entry[8]}.`);
        return [false, [], 0];
      }
      // no shenanagains confirmed
      const date_modified = moment().format(wcpshared.DATE_STRING_INTERNAL_FORMAT);
      const new_balance = credit_balance - store_credit.amount_used;
      const new_entry = [entry[0], entry[1], entry[2], new_balance, entry[4], entry[5], date_modified, entry[7], entry[8], entry[9], entry[10], entry[11], entry[12]];
      const new_range = `CurrentWARIO!${2 + i}:${2 + i}`;
      // TODO switch to volatile-esq update API call
      await GoogleProvider.UpdateValuesInSheet(STORE_CREDIT_SHEET, new_range, new_entry);
      logger.info(`Debited ${store_credit.amount_used} from code ${store_credit.code} yielding balance of ${new_balance}.`);
      return [true, entry, i];
    }
  }
  logger.error(`Not sure how, but the store credit key wasn't found: ${store_credit}`);
  return [false, [], 0];
}

const CheckAndRefundStoreCredit = async (STORE_CREDIT_SHEET, old_entry, index) => {
  // TODO: we're re-validating the encryption key to ensure there's not a race condition or a bug
  // TODO: throw an exception or figure out how to communicate this error

  const new_range = `CurrentWARIO!${2 + index}:${2 + index}`;
  // TODO switch to volatile-esq update API call
  await GoogleProvider.UpdateValuesInSheet(STORE_CREDIT_SHEET, new_range, old_entry);
  return true;
}

const CreateSquareOrderAndCharge = async (logger, reference_id, balance, nonce) => {
  const amount_to_charge = Math.round(balance * 100);
  const create_order_response = await SquareProvider.CreateOrderStoreCredit(reference_id, amount_to_charge);
  if (create_order_response.success === true) {
    const square_order_id = create_order_response.response.order.id;
    logger.info(`For internal id ${reference_id} created Square Order ID: ${square_order_id} for ${amount_to_charge}`)
    const payment_response = await SquareProvider.ProcessPayment(nonce, amount_to_charge, reference_id, square_order_id);
    if (!payment_response.success) {
      logger.error("Failed to process payment: %o", payment_response);
      const order_cancel_response = await SquareProvider.OrderStateChange(square_order_id, create_order_response.response.order.version, "CANCELED");
      logger.debug(JSON.stringify(order_cancel_response));
      return [false, payment_response];
    }
    else {
      logger.info(`For internal id ${reference_id} and Square Order ID: ${square_order_id} payment for ${amount_to_charge} successful.`)
      return [true, payment_response];
    }
  } else {
    logger.error(create_order_response);
    return [false, undefined];
  }
}

const ValidationChain = [  
  body('service_option').isInt({min: 0, max:2}).exists(),
  body('customer_name').trim().escape().exists(),
  body('service_date').trim().escape().exists(),
  body('service_time').isInt({min: 0, max: 1440}).exists(),
  body('phonenum').trim().escape().exists(),
  body('user_email').isEmail().exists(),
  body('referral').escape().optional(),
  //body('delivery_info').deliveryInfoValidator(),
  body('load_time').escape().optional(),
  body('time_selection_time').escape(),
  body('submittime').escape(),
  body('useragent').escape(),
  body('totals.delivery_fee').exists().isFloat({min: 0}),
  body('totals.autograt').exists().isFloat({min: 0}),
  body('totals.subtotal').exists().isFloat({min: 0}),
  body('totals.tax').exists().isFloat({min: 0}),
  body('totals.tip').exists().isFloat({min: 0}),
  body('totals.total').exists().isFloat({min: 0}),
  body('totals.balance').exists().isFloat({min: 0}),
  body('store_credit.amount_used').exists().isFloat({min: 0}),
  // { CID : [<quantity, {pid, modifiers: {MID: [<placement, OID>]}}]}
  //body('products').productsValidator(),
  body('sliced').isBoolean(),
  body('special_instructions').trim().escape()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/order', ValidationChain, async (req, res, next) => {
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = req.db.KeyValueConfig.STORE_NAME;
    const STORE_CREDIT_SHEET = req.db.KeyValueConfig.STORE_CREDIT_SHEET;

    req.logger.info(`Received order request: ${JSON.stringify(req.body)}`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      GoogleProvider.SendEmail(
        EMAIL_ADDRESS,
        [EMAIL_ADDRESS, "dave@windycitypie.com"],
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(errors.array())}</p>`);
      return res.status(422).json({ errors: errors.array() });
    }

    const reference_id = Date.now().toString(36).toUpperCase();
    const nonce = req.body.nonce;
    const service_option_enum = req.body.service_option;
    const service_option_display_string = req.db.Services[service_option_enum];
    const customer_name = req.body.customer_name;
    const service_date = moment(req.body.service_date, wcpshared.DATE_STRING_INTERNAL_FORMAT);
    const service_time = req.body.service_time; //minutes offset from beginning of day
    const date_time_interval = DateTimeIntervalBuilder(service_date, service_time, service_option_enum);
    const service_title = ServiceTitleBuilder(service_option_display_string, customer_name, service_date, date_time_interval);
    const phone_number = req.body.phonenum; // 10 digits matching the required regex
    const customer_email = req.body.user_email;
    const referral = req.body.referral;
    const delivery_info = req.body.delivery_info;
    const website_metrics = {
      load_time: req.body.load_time,
      time_selection_time: req.body.time_selection_time,
      time_submit: req.body.submittime,
      ua: req.body.useragent
    };
    const totals = req.body.totals;
    const store_credit = req.body.store_credit;
    const cart = RebuildOrderFromDTO(req.catalog.Menu, req.body.products);
    const sliced = req.body.sliced || false;
    const special_instructions = req.body.special_instructions;
    let isPaid = false;

    // TODO: wrap all function calls in a try/catch block, or triple check that an exception would be handled in the provider class
    
    // step 1: attempt to process store credit, keep track of old store credit balance in case of failure
    let store_credit_response;
    if (store_credit.amount_used > 0) {
      store_credit_response = await CheckAndSpendStoreCredit(req.logger, STORE_CREDIT_SHEET, store_credit);
      if (!store_credit_response[0]) {
        req.logger.error("Failed to process store credit step of ordering");
        return res.status(404).json({success: false, result: JSON.stringify({errors: [{detail: "Unable to debit store credit."}]})});
      }
    }

    if (totals.balance == 0) {
      isPaid = true;
    }

    // step 2: attempt to charge balance to credit card
    let charging_response = [false, undefined];
    if (totals.balance > 0 && nonce) {
      try {
        charging_response = await CreateSquareOrderAndCharge(req.logger, reference_id, totals.balance, nonce)
      } catch (error) {
        // if any part of step 2 fails, restore old store credit balance
        if (store_credit.amount_used > 0) {
          req.logger.info(`Refunding ${store_credit.code} after failed credit card payment.`);
          await CheckAndRefundStoreCredit(STORE_CREDIT_SHEET, store_credit_response[1], store_credit_response[2]);
        }
        req.logger.error(`Nasty error in processing payment: ${JSON.stringify(error)}.`);
        return res.status(500).json({success:false, result: JSON.stringify({errors: [error]})});
      }
      if (!charging_response[0]) {
        if (store_credit.amount_used > 0) {
          req.logger.info(`Refunding ${store_credit.code} after failed credit card payment.`);
          await CheckAndRefundStoreCredit(STORE_CREDIT_SHEET, store_credit_response[1], store_credit_response[2]);
        }
        return res.status(400).json(charging_response[1]);
      }
      else {
        isPaid = true;
      }
    }

    // step 3: fire off success emails and create order in calendar
    try {
      // send email to customer
      CreateExternalEmail(
        STORE_NAME,
        EMAIL_ADDRESS,
        service_option_enum,
        service_title,
        phone_number,
        customer_email,
        cart,
        special_instructions,
        delivery_info,
        isPaid,
        charging_response[1]);

      // send email to eat(pie)
      CreateInternalEmail(
        STORE_NAME,
        EMAIL_ADDRESS,
        req.catalog.Catalog,
        service_option_enum,
        service_title,
        customer_name,
        service_date,
        date_time_interval,
        phone_number,
        customer_email,
        delivery_info,
        cart,
        sliced,
        referral,
        special_instructions,
        website_metrics,
        isPaid,
        totals,
        charging_response[1],
        store_credit
      );
      CreateOrderEvent(
        req.catalog.Catalog,
        service_option_enum,
        customer_name,
        phone_number,
        cart,
        special_instructions,
        sliced,
        date_time_interval,
        delivery_info,
        isPaid,
        totals,
        charging_response[1],
        store_credit
      );
      // send response to user
      return charging_response[0] ? res.status(200).json(charging_response[1]) : res.status(200).json({ success: true });

    } catch (error) {
      GoogleProvider.SendEmail(
        EMAIL_ADDRESS,
        [EMAIL_ADDRESS, "dave@windycitypie.com"],
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY",
        "dave@windycitypie.com",
        `<p>Order request: ${JSON.stringify(req.body)}</p><p>Error info:${JSON.stringify(error)}</p>`);
      res.status(500).send(error);
      next(error)
    }
  })