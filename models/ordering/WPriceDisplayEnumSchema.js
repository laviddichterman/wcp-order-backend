const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// FROM_X: from X where X is the base price of the product without any modifiers selected
// VARIES: just puts the word VARIES or MP in place of the price
// ALWAYS: just displays the price of the product with the selected modifier options
// MIN_TO_MAX: displays the lowest to highest price in the form `${MIN} to ${MAX}`
// LIST: lists the possible pricing options joined by a forward slash, eg: 8/12
// TODO: move to WCPShared pkg
const PRICE_DISPLAY_ENUMS = ['FROM_X', 'VARIES', 'ALWAYS', 'MIN_TO_MAX', 'LIST'];

// // mix in, not to be instantiated directly
// // options for how to display a price in various contexts
// var WPriceDisplayEnumSchema = new Schema({    
//   type: String,
//   enum: PRICE_DISPLAY_ENUMS
// }, { _id: false});

// module.exports = WPriceDisplayEnumSchema;
