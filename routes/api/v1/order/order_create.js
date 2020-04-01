// submit an order
const Router = require('express').Router
const GoogleProvider = require("../../../../config/google");

const ESCAPED_EVENT_EMAIL_TEMPLATE = process.env.EMAIL_ADDRESS === "eatpie@windycitypie.com" ? "eatpie%40windycitypie.com" : "eat%40breezytownpizza.com"; 
const STORE_NAME = process.env.EMAIL_ADDRESS === "eatpie@windycitypie.com" ? "Windy City Pie" : "Breezy Town Pizza"; 

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
  calendar_event_title_escaped, 
  calendar_event_date,
  calendar_event_detail_escaped, 
  calendar_event_address_escaped,
  confirmation_subject_escaped, 
  confirmation_body_escaped, 
  special_instructions, 
  additional_message, 
  load_time, 
  time_selection_time,
  submittime,
  useragent) => {
    const emailbody =  `<p>From: ${customer_name} ${user_email}</p>

<p>Message Body:</p>
<p>${short_order}</p>
<p>${special_instructions}</p>
<p>Phone: ${phonenum}</p>
<strong style="color: red;">${additional_message}</strong> <br />
Auto-respond: <a href="mailto:${user_email}?subject=${confirmation_subject_escaped}&body=${confirmation_body_escaped}">Confirmation link</a><br />
Event: <a href="https://www.google.com/calendar/render?action=TEMPLATE&src=${ESCAPED_EVENT_EMAIL_TEMPLATE}&text=${calendar_event_title_escaped}&dates=${calendar_event_date}&details=${calendar_event_detail_escaped}${calendar_event_address_escaped}">Calendar Link</a>
    
<p>Referral Information: ${referral}</p>
    
<p>Address: ${address}</p>
${delivery_instructions}    

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
      email_subject, 
      user_email,
      emailbody);
  }

  const CreateExternalEmail = (
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
      
<b>Order information:</b>
<p>Service: ${service_option} for ${customer_name} on ${service_date} at ${service_time}.<br />
Phone: ${phonenum}<br />
Order contents:<br />
${order_long}<br />
${special_instructions}
      
<p><b>Location Information:</b>
We are located at (<a href="http://bit.ly/WindyCityPieMap">5918 Phinney Ave N, 98103</a>. We thank you for your take-out and delivery business at this time.</p>`;
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

module.exports = Router({ mergeParams: true })
  .post('/v1/order', async (req, res, next) => {
    try {
      // send email to customer
      CreateExternalEmail(req.body.service_option, 
        req.body.customer_name, 
        req.body.service_date, 
        req.body.service_time,
        req.body.phonenum, 
        req.body.user_email,
        req.body.order_long,
        req.body.automated_instructions,
        req.body.special_instructions)
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
        req.body.calendar_event_title_escaped,
        req.body.calendar_event_date,
        req.body.calendar_event_detail_escaped,
        req.body.calendar_event_address_escaped,
        req.body.confirmation_subject_escaped,
        req.body.confirmation_body_escaped,
        req.body.special_instructions,
        req.body.additional_message,
        req.body.req.body.load_time, 
        req.body.time_selection_time,
        req.body.submittime,
        req.body.useragent
      )
      // send response to user
      res.status(200).send("Looks good buddy");

    } catch (error) {
      res.status(500).send(error);
      next(error)
    }
  })