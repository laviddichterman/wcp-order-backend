// submit an order
const Router = require('express').Router
const GoogleProvider = require("../../../../config/google");
const moment = require('moment');
const wcpshared = require("@wcp/wcpshared");
//const { check, validationResult } = require('express-validator');

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
  payment
) {
  const WCP_PICKUP_INSTRUCTIONS = "Come to the door and we'll greet you. If there is a line, please form alongside the patio. Please maintain a 6 foot distance between yourself, our team, and other patrons at all times.";
  const BTP_PICKUP_INSTRUCTIONS = "We are currently offering curbside pick-up. We will have someone available to assist you at the front door when you arrive. Please maintain a 6 foot distance between yourself, our team, and other patrons at all times.";

  const BTP_DINE_IN = "Please come to our counter and let us know the name under which your order was placed. Please arrive promptly so your pizza is as fresh as possible and you have time to get situated and get beverages.  We do not reserve seating. Please note that we are all ages until 8pm after which we are a 21 and up venue."
  const WCP_DINE_IN = "Dine-ins get you to the front of the table queue. We don't reserve seating. Please arrive slightly before your selected time so your pizza is as fresh as possible and you have time to get situated and get beverages!";
  const NOTE_DELIVERY_SERVICE = "We appreciate your patience as our in-house delivery service is currently in its infancy. Delivery times are estimated. We might be a little earlier, or a little later.";

  const NOTE_PREPAID = "You've already paid, so unless there's an issue with the order, there's no need to handle payment from this point forward.";
  const NOTE_PAYMENT = "We happily accept any major credit card or cash for payment upon arrival.";

  const store_address = STORE_NAME === WCP ? WCP_ADDRESS : BTP_ADDRESS;
  const pickup_instructions = STORE_NAME === WCP ? WCP_PICKUP_INSTRUCTIONS : BTP_PICKUP_INSTRUCTIONS;
  const dinein_instructions = STORE_NAME === WCP ? WCP_DINE_IN : BTP_DINE_IN;
  const service_instructions = [pickup_instructions, dinein_instructions, NOTE_DELIVERY_SERVICE];
  const nice_area_code = IsNativeAreaCode(phone_number, STORE_NAME === WCP ? WCP_AREA_CODES : BTP_AREA_CODES);
  const payment_section = payment.ispaid ? NOTE_PREPAID : NOTE_PAYMENT;
  const display_time = DateTimeIntervalToDisplayServiceInterval(date_time_interval);
  const confirm = [`We're happy to confirm your ${display_time} pickup at`, `We're happy to confirm your ${display_time} order at`, `We're happy to confirm your delivery around ${display_time} at`];
  const where = [store_address, store_address, delivery_info.validated_delivery_address];
  return encodeURI(`${nice_area_code ? "Hey, nice area code!" : "Thanks!"} ${confirm[service_type_enum]} ${where[service_type_enum]}.\n\n${service_instructions[service_type_enum]} ${payment_section}`);
}

const GeneratePaymentSection = (totals, payment_info, ishtml) => {
  const base_amount = "$" + Number(totals.total - totals.tip).toFixed(2);
  const tip_amount = "$" + Number(totals.tip).toFixed(2);
  const total_amount = "$" + payment_info.result.payment.total_money.amount / 100;
  const receipt_url = payment_info.result.payment.receipt_url;
  return ishtml ? `<p>Received payment of: <strong>${total_amount}</strong></p>
  <p>Base Amount: <strong>${base_amount}</strong><br />
  Tip Amount: <strong>${tip_amount}</strong><br />
  Confirm the above values in the <a href="${receipt_url}">receipt</a></p>` :
    `Received payment of: ${total_amount}
  Base Amount: ${base_amount}
  Tip Amount: ${tip_amount}
  Receipt: ${receipt_url}`;
}

const GenerateDeliverySection = (delivery_info, ishtml) => {
  if (!delivery_info.validated_delivery_address) {
    return "";
  }
  const delivery_unit_info = delivery_info.address2 ? `, Unit info: ${delivery_info.address2}` : "";
  const delivery_instructions = delivery_info.instructions ? `${ishtml ? "<br />" : "\n"}Delivery Instructions: ${delivery_info.instructions}` : "";
  return `${ishtml ? "<p><strong>" : "\n"}Delivery Address:${ishtml ? "</strong>":""} ${delivery_info.validated_delivery_address}${delivery_unit_info}${delivery_instructions}${ishtml ? "</p>" : ""}`;
}

const EventTitleStringBuilder = (service, customer, products, special_instructions, sliced, ispaid) => {
  // TODO: need to figure out products serialization
  const SERVICE_SHORTHAND = ["P", "DINE", "DELIVER"]; // TODO: move to DB
  const service_string = SERVICE_SHORTHAND[service];

  var has_special_instructions = special_instructions && special_instructions.length > 0;

  var num_pizzas = 0;
  var pizza_shortcodes = "";
  for (var i in products.pizza) {
    var quantity = products.pizza[i][0];
    var shortcode = products.pizza[i][1].shortcode;
    num_pizzas = num_pizzas + quantity;
    pizza_shortcodes = pizza_shortcodes + Array(quantity + 1).join(" " + shortcode);
  }
  var extras_shortcodes = "";
  for (var j in products.extras) {
    var quantity = products.extras[j][0];
    var shortcode = products.extras[j][1].shortcode;
    extras_shortcodes = extras_shortcodes + " " + quantity.toString(10) + "x" + shortcode;
  }

  var pizzas_title = num_pizzas + "x" + pizza_shortcodes;
  var extras_title = extras_shortcodes.length > 0 ? "Extras" + extras_shortcodes : "";

  return `${service_string}${sliced ? " SLICED" : ""} ${customer} ${pizzas_title} ${extras_title}${has_special_instructions ? " *" : ""}${ispaid ? " PAID" : " UNPAID"}`;
};


const ServiceTitleBuilder = (service_option_display_string, customer_name, service_date, service_time_interval) => {
  const display_service_time_interval = DateTimeIntervalToDisplayServiceInterval(service_time_interval);
  return `${service_option_display_string} for ${customer_name} on ${service_date.format(DISPLAY_DATE_FORMAT)} at ${display_service_time_interval}`;
}

const GenerateDisplayCartStringListFromProducts = (products) => {
  return products.pizza.map(x=> `${x[0]}x: ${x[1].name}`).concat(products.extras.map(x=> `${x[0]}x: ${x[1].name}`));
}

const GenerateShortCartStringListFromProducts = (products, sliced) => {
  return products.pizza.map(x=> `${x[0]}x: ${x[1].shortname}${sliced ? " SLICED" : ""}`).concat(products.extras.map(x=> `${x[0]}x: ${x[1].name}`));
}

const CreateInternalEmail = (
  STORE_NAME,
  EMAIL_ADDRESS,
  service_type_enum,
  service_title,
  customer_name,
  service_date, // moment
  date_time_interval,
  phonenum,
  user_email,
  delivery_info,
  products,
  sliced,
  referral,
  special_instructions,
  website_metrics,
  payment) => {
  const confirmation_body_escaped = GenerateAutoResponseBodyEscaped(STORE_NAME, service_type_enum, date_time_interval, phonenum, delivery_info, payment)
  const confirmation_subject_escaped = encodeURI(service_title);
  const payment_section = payment.ispaid ? GeneratePaymentSection(payment.totals, payment.payment_info, true) : "";
  const delivery_section = GenerateDeliverySection(delivery_info, true);
  const shortcart = GenerateShortCartStringListFromProducts(products, sliced);
  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "<br />Special Instructions: " + special_instructions : "";
  const emailbody = `<p>From: ${customer_name} ${user_email}</p>
<p>Message Body:<br />
${shortcart.join("<br />")}
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
    service_title + (payment.ispaid ? " *ORDER PAID*" : " _UNPAID_"),
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
  products,
  special_instructions,
  delivery_info,
  payment
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
  const cartstring = GenerateDisplayCartStringListFromProducts(products);
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
${payment.ispaid ? `<br /><a href="${payment.payment_info.result.payment.receipt_url}">Here's a link to your receipt!</a>` : ""}
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
  service_option_enum,
  customer_name,
  phone_number,
  products,
  special_instructions,
  sliced,
  service_time_interval,
  delivery_info,
  payment) => {
  const shortcart = GenerateShortCartStringListFromProducts(products, sliced);
  const calendar_event_title = EventTitleStringBuilder(service_option_enum, customer_name, products, special_instructions, sliced, payment.ispaid);

  const special_instructions_section = special_instructions && special_instructions.length > 0 ? "\nSpecial Instructions: " + special_instructions : "";

  const payment_section = payment.ispaid ? "\n" + GeneratePaymentSection(payment.totals, payment.payment_info, false) : "";

  const delivery_section = GenerateDeliverySection(delivery_info, false);

  const calendar_details = `${shortcart.join("\n")}\nph: ${phone_number}${special_instructions_section}${delivery_section}${payment_section}`;

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

// const OrderValidation = [
//   check('service_option').isInt({}).positive().required(),
//   check('customer_name'): Joi.string().required().escape(),
//   check('service_date'): Joi.string().required().escape(),
//   check('service_time'): Joi.number().positive().required(),
//   check('phonenum'): Joi.string().required().escape(),
//   check('user_email'): Joi.isEmail().required(),
//   check('referral'): Joi.string().escape()
//   check('delivery_info'),
//   check('load_time'),
//   check('time_selection_time'),
//   check('submittime'),
//   check('useragent'),
//   check('totals'),
//   check('payment_info'),
//   check('ispaid'),
//   check('products'),
//   check('sliced'),
//   check('special_instructions'),
//   ]

module.exports = Router({ mergeParams: true })
  .post('/v1/order/', async (req, res, next) => {
    // validation stuff
    // if (!date || !date.isValid() || isNaN(time) || time < 0) { // needs to be changed to check the values in the interval for 
    //   return "";
    // }
    const EMAIL_ADDRESS = req.db.KeyValueConfig.EMAIL_ADDRESS;
    const STORE_NAME = req.db.KeyValueConfig.STORE_NAME;
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
    const payment = {
      totals: req.body.totals,
      payment_info: req.body.payment_info,
      ispaid: req.body.ispaid
    };

    const products = req.body.products;
    const sliced = req.body.sliced || false;
    const special_instructions = req.body.special_instructions;
    try {
      // send email to customer
      CreateExternalEmail(
        STORE_NAME,
        EMAIL_ADDRESS,
        service_option_enum,
        service_title,
        phone_number,
        customer_email,
        products,
        special_instructions,
        delivery_info,
        payment);

      // send email to eat(pie)
      CreateInternalEmail(
        STORE_NAME,
        EMAIL_ADDRESS,
        service_option_enum,
        service_title,
        customer_name,
        service_date,
        date_time_interval,
        phone_number,
        customer_email,
        delivery_info,
        products,
        sliced,
        referral,
        special_instructions,
        website_metrics,
        payment
      );
      CreateOrderEvent(
        service_option_enum,
        customer_name,
        phone_number,
        products,
        special_instructions,
        sliced,
        date_time_interval,
        delivery_info,
        payment
      );
      // send response to user
      res.status(200).send("Looks good buddy");

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