import mongoose from 'mongoose';
import logger from "./logging";

const DBTABLE = process.env.DBTABLE || "wcp";
const DBUSER = process.env.DBUSER || null;
const DBPASS = process.env.DBPASS || null;
const DBENDPOINT = process.env.DBENDPOINT || '127.0.0.1:27017';

export const ConnectToDatabase = () => {
  const url = `mongodb://${DBENDPOINT}/${DBTABLE}`;
  mongoose.connect(url, { user: DBUSER, pass: DBPASS });
  mongoose
    .connection
    .on('error', error => {
      throw error
    })
    .once('open', () => logger.info(`MongoDB connected at ${url}`));
}

export default ConnectToDatabase;

module.exports = ConnectToDatabase;
