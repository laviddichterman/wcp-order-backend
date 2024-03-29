require('dotenv').config();

import { GoogleProviderInstance } from "./config/google";
import { SquareProviderInstance } from "./config/square";
import { DatabaseManagerInstance } from "./config/database_manager";
import { DataProviderInstance } from "./config/dataprovider";
import { CatalogProviderInstance } from "./config/catalog_provider";
import { SocketIoProviderInstance } from "./config/socketio_provider";
import { OrderManagerInstance } from "./config/order_manager";
import { DeliveryAddressController } from "./controllers/DeliveryAddressController";
import { KeyValueStoreController } from "./controllers/KeyValueStoreController";
import { ModifierController } from "./controllers/ModifierController";
import { ProductController } from "./controllers/ProductController";
import { ProductInstanceFunctionController } from "./controllers/ProductInstanceFunctionController";
import { FulfillmentController } from "./controllers/FulfillmentController";
import { SettingsController } from "./controllers/SettingsController";
import { CategoryController } from "./controllers/CategoryController";
import { StoreCreditController } from "./controllers/StoreCreditController";
import { AccountingController } from "./controllers/AccountingController";
import { OrderController } from "./controllers/OrderController";
import { PrinterGroupController } from "./controllers/PrinterGroupController";
import WApp from './App';
import logger from './logging';

if (!process.env.TZ) {
  logger.error("Missing config for TZ (timezone) ");
  process.exit(1);
}

const app = new WApp(["nsRO"],
  [
    new DeliveryAddressController(),
    new KeyValueStoreController(),
    new ModifierController(),
    new ProductController(),
    new ProductInstanceFunctionController(),
    new CategoryController(),
    new SettingsController(),
    new StoreCreditController(),
    new AccountingController(),
    new OrderController(),
    new FulfillmentController(),
    new PrinterGroupController()
  ],
  [DatabaseManagerInstance, 
    DataProviderInstance, 
    GoogleProviderInstance, 
    SquareProviderInstance, 
    CatalogProviderInstance, 
    SocketIoProviderInstance,
    OrderManagerInstance]
);

app.listen();

module.exports = app;