import { Request } from 'express';

interface WRequest extends Request {
  base: string;
  logger: import('winston').Logger;
  catalog: import('../config/catalog_provider').CatalogProvider;
  socket_ro: import('socket.io').Namespace;
  db: import('../config/dataprovider').DataProvider;
}

export default WRequest;