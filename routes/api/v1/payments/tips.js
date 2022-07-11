// some thing relating to payments
const Router = require('express').Router
const { formatRFC3339, startOfDay, parse, addDays } = require('date-fns');
const { WDateUtils } = require("@wcp/wcpshared");
const GoogleProvider = require("../../../../config/google");
//const { validate, Joi } = require('express-validation')

const tipsregex = /Tip Amount: \$([0-9]+(?:\.[0-9]{1,2})?)/;
module.exports = Router({ mergeParams: true })
  .get('/v1/payments/tips', async (req, res, next) => {
    try {

      const tips_date = startOfDay(parse(req.query.date, WDateUtils.DATE_STRING_INTERNAL_FORMAT, new Date()));
      const min_date = formatRFC3339(tips_date);
      const max_date = formatRFC3339(addDays(tips_date, 1));
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