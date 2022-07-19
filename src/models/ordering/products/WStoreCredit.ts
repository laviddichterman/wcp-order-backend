import {Schema} from "mongoose";
import { WMoney} from "../WMoney";

// represents a class of products that can be made and inserted into the catalog
export const WStoreCredit = new Schema({
  code: { type: String, required: true },
  names: [String],
  initial_value: WMoney,
  balance: WMoney,
  associated_orders: [String],
  creation_date: String,
  last_used_date: String,
  //Needs something like this for accounting: 
  //transactions: [WValueChange]
  //payment_info: 
});


module.exports = WStoreCredit;
