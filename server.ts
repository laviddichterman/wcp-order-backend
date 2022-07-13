require('dotenv').config();

import GoogleProvider from "./config/google";
import SquareProvider from "./config/square";
import DatabaseManagerInstance from "./config/database_manager";
import DataProviderInstance from "./config/dataprovider";
import CatalogProviderInstance from "./config/catalog_provider";
import SocketIoProviderInstance from "./config/socketio_provider";
import WApp from './App';

const app = new WApp(["nsRO"],
  [
    // new PostController(),
    // new AuthenticationController(),
    // new UserController(),
    // new ReportController(),
  ],
  [DatabaseManagerInstance, 
    DataProviderInstance, 
    GoogleProvider, 
    SquareProvider, 
    CatalogProviderInstance, 
    SocketIoProviderInstance]
);

app.listen();

module.exports = app;