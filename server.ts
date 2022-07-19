require('dotenv').config();

import GoogleProvider from "./config/google";
import SquareProvider from "./config/square";
import DatabaseManagerInstance from "./config/database_manager";
import DataProviderInstance from "./config/dataprovider";
import CatalogProviderInstance from "./config/catalog_provider";
import SocketIoProviderInstance from "./config/socketio_provider";
import OrderManagerInstance from "./config/order_manager";
import { DeliveryAddressController } from "./controllers/DeliveryAddressController";
import { KeyValueStoreController } from "./controllers/KeyValueStoreController";
import { ModifierController } from "./controllers/ModifierController";
import { ProductController } from "./controllers/ProductController";
import { ProductInstanceFunctionController } from "./controllers/ProductInstanceFunctionController";
import { SettingsController } from "./controllers/SettingsController";
import { CategoryController } from "./controllers/CategoryController";
import { StoreCreditController } from "./controllers/StoreCreditController";
import { AccountingController } from "./controllers/AccountingController";
import { OrderController } from "./controllers/OrderController";
import WApp from './App';

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
    new OrderController()
  ],
  [DatabaseManagerInstance, 
    DataProviderInstance, 
    GoogleProvider, 
    SquareProvider, 
    CatalogProviderInstance, 
    SocketIoProviderInstance,
    OrderManagerInstance]
);

app.listen();

module.exports = app;