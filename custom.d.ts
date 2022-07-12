// declare module 'express-serve-static-core' {
//   interface Request {
//     base?: string;
//     logger?: import('winston').Logger;
//     catalog?: import('./config/catalog_provider').CatalogProvider;
//     socket_ro?: import('socket.io').Namespace;
//     db?: import('./config/dataprovider').DataProvider;
//   }
// }

// declare module 'mongoose' {
//   type Promise<T> = import('bluebird')<T>;
// }