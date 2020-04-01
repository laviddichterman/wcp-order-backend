// submit an order
const Router = require('express').Router
const GoogleProvider = require("../../../../config/google");

const STORE_NAME = process.env.EMAIL_ADDRESS === "eatpie@windycitypie.com" ? "Windy City Pie" : "Breezy Town Pizza"; 

const GeneratePaymentSection = (payment_info) => {
  const base_amount = "$" + payment_info.result.payment.amount_money.amount / 100;
  const tip_amount = "$" + payment_info.result.payment.tip_money.amount / 100;
  const total_amount = "$" + payment_info.result.payment.total_money.amount / 100;
  const receipt_url = payment_info.result.payment.receipt_url;
  return `<p>Received payment of: <strong>${total_amount}</strong></p>
  <p>Base Amount: <strong>${base_amount}</strong><br />
  Tip Amount: <strong>${tip_amount}</strong><br />
  Confirm the above values in the <a href="${receipt_url}">receipt</a><br />
  Order ID: ${response.order_id}</p>`;
}

const CreateInternalEmail = (
  service_option, 
  customer_name, 
  service_date, 
  service_time, 
  phonenum, 
  user_email, 
  address, 
  delivery_instructions,
  short_order, 
  referral, 
  confirmation_subject_escaped, 
  confirmation_body_escaped, 
  special_instructions, 
  additional_message, 
  load_time, 
  time_selection_time,
  submittime,
  useragent,
  ispaid,
  payment_info) => {
    const payment_section = ispaid ? GeneratePaymentSection(payment_info) : "";
    const emailbody =  `<p>From: ${customer_name} ${user_email}</p>

<p>Message Body:<br />
${short_order.join("<br />")}
${special_instructions}<br />
Phone: ${phonenum}</p>
<strong style="color: red;">${additional_message}</strong> <br />
Auto-respond: <a href="mailto:${user_email}?subject=${confirmation_subject_escaped}&body=${confirmation_body_escaped}">Confirmation link</a><br />
    
<p>Referral Information: ${referral}</p>
    
<p>Address: ${address}<br />
${delivery_instructions ? "Delivery instructions: " + delivery_instructions : ""}</p>

${payment_section}

<p>Debug info:<br />
Load: ${load_time}<br />
Time select: ${time_selection_time}<br />
Submit: ${submittime}<br />
<p>Useragent: ${useragent}</p>`;
    const email_subject = `${service_option} for ${customer_name} on ${service_date} - ${service_time}`;
    GoogleProvider.SendEmail(
      {
        name: customer_name,
        address: process.env.EMAIL_ADDRESS  
      },
      process.env.EMAIL_ADDRESS,   
      email_subject + (ispaid ? "* ORDER PAID *" : ""), 
      user_email,
      emailbody);
}

const CreateExternalEmailWCP = (
  service_option, 
  customer_name, 
  service_date, 
  service_time, 
  phonenum, 
  user_email, 
  order_long, 
  automated_instructions,
  special_instructions 
) => {
    const emailbody =  `<p>Thanks so much for ordering Seattle's best Chicago-style pan deep-dish pizza!</p>
<p>We take your health seriously; be assured your order has been prepared with the utmost care.</p>
<p>Note that all gratuity is shared with the entire Windy City Pie family.</p>
<p>${automated_instructions}</p>
<p>Please take some time to ensure the details of your order as they were entered are correct. If the order is fine, there is no need to respond to this message. If you need to make a correction or have a question, please respond to this message as soon as possible.</p>
    
<b>Order information:</b><br />
Service: ${service_option} for ${customer_name} on ${service_date} at ${service_time}.<br />
Phone: ${phonenum}<br />
Order contents:<br />
${order_long.join("<br />")}<br />
${special_instructions}
    
<p><b>Location Information:</b>
We are located at (<a href="http://bit.ly/WindyCityPieMap">5918 Phinney Ave N, 98103</a>). We thank you for your take-out and delivery business at this time.</p>`;
    const email_subject = `${service_option} for ${customer_name} on ${service_date} - ${service_time}`;
    GoogleProvider.SendEmail(
      {
        name: STORE_NAME,
        address: process.env.EMAIL_ADDRESS  
      },
      user_email,  
      email_subject, 
      process.env.EMAIL_ADDRESS, 
      emailbody);
}

const CreateExternalEmailBTP = (
  service_option, 
  customer_name, 
  service_date, 
  service_time, 
  phonenum, 
  user_email, 
  order_long, 
  automated_instructions,
  special_instructions 
) => {
    const emailbody =  `<p>Thanks so much for ordering Seattle's best Chicago-ish, Detroit-ish pan deep-dish pizza!</p>
<p>We take your health seriously; be assured your order has been prepared with the utmost care.</p>
<p>Note that all gratuity is shared with the entire Breezy Town Pizza family.</p>
<p>${automated_instructions}</p>
<p>Please take some time to ensure the details of your order as they were entered are correct. If the order is fine, there is no need to respond to this message. If you need to make a correction or have a question, please respond to this message as soon as possible.</p>
    
<b>Order information:</b><br />
Service: ${service_option} for ${customer_name} on ${service_date} at ${service_time}.<br />
Phone: ${phonenum}<br />
Order contents:<br />
${order_long.join("<br />")}<br />
${special_instructions}
    
<p><b>Location Information:</b>
We are located inside Clock-Out Lounge (<a href="http://bit.ly/BreezyTownAtClockOut">4864 Beacon Ave S, 98108</a>). We thank you for your take-out and delivery business at this time.</p>`;
    const email_subject = `${service_option} for ${customer_name} on ${service_date} - ${service_time}`;
    GoogleProvider.SendEmail(
      {
        name: STORE_NAME,
        address: process.env.EMAIL_ADDRESS  
      },
      user_email,  
      email_subject, 
      process.env.EMAIL_ADDRESS, 
      emailbody);
}

const CreateOrderEvent = (
  calendar_event_title, 
  calendar_event_dates, 
  calendar_event_detail, 
  calendar_event_address,
  address,
  delivery_instructions) => {

  const calendar_details = `${calendar_event_detail}${address ? "<br />Address: " + address : ""}${delivery_instructions ? "<br />Delivery Instructions: " + delivery_instructions : ""}`;
  return GoogleProvider.CreateCalendarEvent(calendar_event_title,
    calendar_event_address ? calendar_event_address : "", 
    calendar_details, 
    { dateTime: calendar_event_dates[0] }, 
    { dateTime: calendar_event_dates[1] });
}


module.exports = Router({ mergeParams: true })
  .post('/v1/order/', async (req, res, next) => {
    try {
      // send email to customer
      process.env.EMAIL_ADDRESS === "eatpie@windycitypie.com" ? CreateExternalEmailWCP(req.body.service_option, 
        req.body.customer_name, 
        req.body.service_date, 
        req.body.service_time,
        req.body.phonenum, 
        req.body.user_email,
        req.body.order_long,
        req.body.automated_instructions,
        req.body.special_instructions) : 
        CreateExternalEmailBTP(req.body.service_option, 
          req.body.customer_name, 
          req.body.service_date, 
          req.body.service_time,
          req.body.phonenum, 
          req.body.user_email,
          req.body.order_long,
          req.body.automated_instructions,
          req.body.special_instructions);      
      // send email to eatpie
      CreateInternalEmail(
        req.body.service_option,
        req.body.customer_name,
        req.body.service_date,
        req.body.service_time,
        req.body.phonenum,
        req.body.user_email,
        req.body.address,
        req.body.delivery_instructions,
        req.body.short_order,
        req.body.referral,
        req.body.confirmation_subject_escaped,
        req.body.confirmation_body_escaped,
        req.body.special_instructions,
        req.body.additional_message,
        req.body.load_time, 
        req.body.time_selection_time,
        req.body.submittime,
        req.body.useragent,
        req.body.ispaid,
        req.body.payment_info
      );
      CreateOrderEvent(
        req.body.calendar_event_title,
        req.body.calendar_event_dates, 
        req.body.calendar_event_detail, 
        req.body.calendar_event_address,
        req.body.address,
        req.body.delivery_instructions
        );
      // send response to user
      res.status(200).send("Looks good buddy");

    } catch (error) {
      GoogleProvider.SendEmail(
        process.env.EMAIL_ADDRESS,
        [process.env.EMAIL_ADDRESS, "dave@windycitypie.com"],   
        "ERROR IN ORDER PROCESSING. CONTACT DAVE IMMEDIATELY", 
        "dave@windycitypie.com",
        JSON.stringify(req.body) + JSON.stringify(error));
      res.status(500).send(error);
      next(error)
    }
  })