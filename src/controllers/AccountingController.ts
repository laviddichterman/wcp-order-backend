import { Router, Request, Response, NextFunction } from 'express';
import IExpressController from '../types/IExpressController';
//import { CheckJWT, ScopeAccountingRead, ScopeAccountingWrite } from '../config/authorization';
import { GoogleProviderInstance } from '../config/google';
import { addDays, formatRFC3339, parseISO, startOfDay } from 'date-fns';

const tipsregex = /Tip Amount: \$([0-9]+(?:\.[0-9]{1,2})?)/;

export class AccountingController implements IExpressController {
  public path = "/api/v1/payments";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/tips`, this.getTips);
  };

  private getTips = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tips_date = startOfDay(parseISO(req.query.date as string));
      const min_date = formatRFC3339(tips_date);
      const max_date = formatRFC3339(addDays(tips_date, 1));
      const events = await GoogleProviderInstance.GetEventsForDate(min_date, max_date, "America/Los_Angeles");
      var tips_array : (number | string)[] = [];
      events!.map((event, i) => {
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
  }

}