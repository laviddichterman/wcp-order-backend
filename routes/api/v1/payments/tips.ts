// some thing relating to payments
import { Router, Request, Response, NextFunction } from 'express';
import { formatRFC3339, startOfDay, parse, addDays } from 'date-fns';
import { WDateUtils } from "@wcp/wcpshared";
import GoogleProvider from "../../../../config/google";
//import { validate, Joi } from 'express-validation'

const tipsregex = /Tip Amount: \$([0-9]+(?:\.[0-9]{1,2})?)/;
module.exports = Router({ mergeParams: true })
  .get('/v1/payments/tips', async (req : Request, res: Response, next: NextFunction) => {
    try {

      const tips_date = startOfDay(parse(req.query.date as string, WDateUtils.DATE_STRING_INTERNAL_FORMAT, new Date()));
      const min_date = formatRFC3339(tips_date);
      const max_date = formatRFC3339(addDays(tips_date, 1));
      const events = await GoogleProvider.GetEventsForDate(min_date, max_date, "America/Los_Angeles");
      var tips_array : (number | string)[] = [];
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