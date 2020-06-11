// some thing relating to payments
const Router = require('express').Router
const moment = require('moment');
const wcpshared = require("@wcp/wcpshared");
const GoogleProvider = require("../../../../config/google");
//const { validate, Joi } = require('express-validation')

const tipsregex = /Tip Amount: \$([0-9]+(?:\.[0-9]{1,2})?)/;
module.exports = Router({ mergeParams: true })
  .get('/v1/payments/tips', async (req, res, next) => {
    try {

      const tips_date = moment(req.query.date, wcpshared.DATE_STRING_INTERNAL_FORMAT);
      const min_date = tips_date.format(GoogleProvider.GOOGLE_EVENTS_DATETIME_FORMAT);
      const max_date = tips_date.add(1, "day").format(GoogleProvider.GOOGLE_EVENTS_DATETIME_FORMAT);
      const events = await GoogleProvider.GetEventsForDate(min_date, max_date, "America/Los_Angeles");
      var tips_array = [];
      events.map((event, i) => {
        if (event && event.description) {
          const tips_match = event.description.match(tipsregex);
          if (tips_match) {
            tips_array.push(parseFloat(tips_match[1]))
          }
        }
      })
      res.status(200).json(tips_array);
    } catch (error) {
      next(error)
    }
  })