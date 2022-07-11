import type {Logger} from 'winston';
import * as Bluebird from 'bluebird';

declare module 'express-serve-static-core' {
  interface Request {
    base?: string;
    logger?: Logger;
    db?: any;
    catalog?: any
    socket_ro?: any;
  }
}

declare module 'mongoose' {
  type Promise<T> = Bluebird<T>;
}