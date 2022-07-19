import bodyParser from 'body-parser';
import express, { Application} from 'express';
import mongoose, { Schema } from 'mongoose';
import { Server as IoServer, Namespace as IoNamespace } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import expressWinston from 'express-winston';
import IExpressController from './types/IExpressController';
import logger from "./logging";
import { idempotency } from 'express-idempotency';
import cors from 'cors';
import { WProvider } from './types/WProvider';
import errorMiddleware from './middleware/errorMiddleware';

// // Duplicate the ID field.
// Schema.virtual<string>('id').get(function(){
//   return this._id.toHexString();
// });

// Ensure virtual fields are serialised.
// Schema.set('toJSON', {
//   virtuals: true
// });

const PORT = process.env.PORT || 4001;
const ORIGINS = [/https:\/\/.*\.windycitypie\.com$/, /https:\/\/.*\.breezytownpizza\.com$/, `http://localhost:${PORT}`];

export class WApp {
  private hasBootstrapped: boolean;
  private providers: WProvider[];
  public app: Application;
  public httpServer : HttpServer; 
  public io: IoServer;
  public ioNS: { [ns:string]: IoNamespace };

  constructor(ioNamespaces: string[], controllers: IExpressController[], providers: WProvider[]) {
    this.hasBootstrapped = false;
    this.providers = providers;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new IoServer(this.httpServer, 
      {
        transports: ["websocket", "polling"],
        cors: {
          origin: ORIGINS,
          methods: ["GET", "POST"],
          credentials: true
        }
      });
    this.ioNS = ioNamespaces.reduce((acc, ns) => ({...acc, [ns]: this.io.of(ns) }), {});
    this.initializeMiddlewares();
    this.initializeControllers(controllers);
    this.initializeErrorHandling();
  }

  public async listen() {
    logger.info("Starting connection to DB");
    const DBTABLE = process.env.DBTABLE || "wcp";
    const DBUSER = process.env.DBUSER || null;
    const DBPASS = process.env.DBPASS || null;
    const DBENDPOINT = process.env.DBENDPOINT || '127.0.0.1:27017';
    const url = `mongodb://${DBENDPOINT}/${DBTABLE}`;
    mongoose.connect(url, { user: DBUSER, pass: DBPASS });
    mongoose.connection
    .on('error', error => { throw error })
    .once('open', async () => { 
      logger.info(`MongoDB connected at ${url}`);
      await this.runBootstrap();
      this.httpServer.listen(PORT, function () {
        logger.info(`App listening on the port ${PORT}`);
      });
     });
  }

  public getApp() {
    return this.app;
  }

  public getServer() { 
    return this.httpServer;
  }

  public getSocketIoServer() {
    return this.io;
  }

  public getSocketIoNamespace(ns: string) {
    return Object.hasOwn(this.ioNS, ns) ? this.ioNS[ns] : null;
  }

  private initializeMiddlewares() {
    this.app.use(idempotency());
    this.app.use(cors({origin: ORIGINS}));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(expressWinston.logger({
      winstonInstance: logger,
      msg: '{{res.statusCode}} {{req.method}} {{req.url}} {{res.responseTime}}ms',
      meta: false,
    }));
  }

  private initializeErrorHandling() {
    this.app.use(errorMiddleware);
  }

  private async runBootstrap() {
    this.hasBootstrapped = true;
    for (let i = 0; i < this.providers.length; ++i) {
      await this.providers[i].Bootstrap(this);
    }
  }

  private initializeControllers(controllers: IExpressController[]) {
    controllers.forEach((controller) => {
      this.app.use('/', controller.router);
    });
  }

  private connectDb() {
  }
}

export default WApp;