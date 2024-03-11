import { Router, Request, Response, NextFunction } from 'express';
import IExpressController from '../types/IExpressController';
//import { CheckJWT, ScopeAccountingRead, ScopeAccountingWrite } from '../config/authorization';
import { GoogleProviderInstance } from '../config/google';
import { addDays, formatRFC3339, parseISO, startOfDay } from 'date-fns';
import { OrderManagerInstance } from '../config/order_manager';
import { CatalogProviderInstance } from './../config/catalog_provider';
import { CURRENCY, CoreCartEntry, CreateProductWithMetadataFromV2Dto, IMoney, WDateUtils, WOrderStatus, WProduct } from '@wcp/wcpshared';
import logger from '../logging';

const tipsregex = /Tip Amount: \$([0-9]+(?:\.[0-9]{1,2})?)/;

type CategorySalesMap = Record<string, { name: string; sum: IMoney; quantity: number; }>;
interface ReportAccumulator { 
  discount: IMoney;
  categorySales: CategorySalesMap;
  tips: IMoney;
  tax: IMoney;
  tendered: IMoney;
};

const CategorySalesMapMerger = (sales_map: CategorySalesMap, cart: CoreCartEntry<WProduct>[]): CategorySalesMap => {
  return cart.reduce((acc, e) => { 
    if (Object.hasOwn(acc, e.categoryId)) {
      const existing = acc[e.categoryId];
      return {
        ...acc, 
        [e.categoryId]: { 
          name: existing.name, 
          quantity: e.quantity + existing.quantity, 
          sum: { currency: existing.sum.currency, amount: existing.sum.amount + (e.quantity * e.product.m.price.amount) }
        }
      };
    } else {
      const categoryName = CatalogProviderInstance.Categories[e.categoryId].name;
      return { ...acc, 
        [e.categoryId]: { 
          name: categoryName,
          quantity: e.quantity, 
          sum: { currency: e.product.m.price.currency, amount: (e.quantity * e.product.m.price.amount) }
        }
      };
    }
  }, sales_map);
}
export class AccountingController implements IExpressController {
  public path = "/api/v1/payments";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/tips`, this.getTips);
    this.router.get(`${this.path}/report`, this.getReport);
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

  private getReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report_date = req.query.date as string;
      const orders = await OrderManagerInstance.GetOrders(report_date, WOrderStatus.CONFIRMED);
      const report = orders.reduce((acc, o) => {
        const service_time = WDateUtils.ComputeServiceDateTime(o.fulfillment);
        const order_discount_amount = o.discounts.reduce((inner_acc, d) => inner_acc + d.discount.amount.amount, 0);
        const order_tax_amount = o.taxes.reduce((inner_acc, t) => inner_acc + t.amount.amount, 0);
        const sum_payments = o.payments.reduce((inner_acc, p) => ({ tip_amount: inner_acc.tip_amount + p.tipAmount.amount, payment_amount: inner_acc.payment_amount + p.amount.amount }), { tip_amount: 0, payment_amount: 0});
        const convertedCart: CoreCartEntry<WProduct>[] = o.cart.map(x => {
          return { categoryId: x.categoryId, quantity: x.quantity, product: CreateProductWithMetadataFromV2Dto(x.product, CatalogProviderInstance.CatalogSelectors, service_time, o.fulfillment.selectedService) }
        })
        //return { amount: o.cart.reduce((acc, entry) => acc + (entry.product.m.price.amount * entry.quantity), 0), currency: CURRENCY.USD };
        return { 
          discount: { currency: acc.discount.currency, amount: acc.discount.amount + order_discount_amount }, 
          tax: { currency: acc.discount.currency, amount: acc.tax.amount + order_tax_amount }, 
          categorySales: CategorySalesMapMerger(acc.categorySales, convertedCart),
          tendered: { currency: acc.tendered.currency, amount: acc.tendered.amount + sum_payments.payment_amount },
          tips: { currency: acc.tips.currency, amount: acc.tips.amount + sum_payments.tip_amount },
        }  satisfies ReportAccumulator;
      }, { 
        discount: { currency: CURRENCY.USD, amount: 0 },
        categorySales: { },
        tips: { currency: CURRENCY.USD, amount: 0 },
        tax: { currency: CURRENCY.USD, amount: 0 },
        tendered: { currency: CURRENCY.USD, amount: 0 }
      } as ReportAccumulator);
      
      res.status(200).json(report);
    } catch (error) {
      next(error)
    }
  }

}