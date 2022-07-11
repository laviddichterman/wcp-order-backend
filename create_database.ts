import mongoose from 'mongoose';
import glob from 'glob';
import path from 'path';
import winston from 'winston';
import * as models from './models';

const DBTABLE = process.env.DBTABLE || "wcp";
const DBUSER = process.env.DBUSER || null;
const DBPASS = process.env.DBPASS || null;
const DBENDPOINT = process.env.DBENDPOINT || 'mongodb://127.0.0.1:27017';

module.exports = ({ logger } : { logger: winston.Logger }) => {
  const url = `${DBENDPOINT}/${DBTABLE}`;
  mongoose.connect(url, { user: DBUSER, pass: DBPASS });
  new Promise((resolve, reject) => {
    glob('./models/**/*.ts', { cwd: __dirname }, function (err, res) {
      if (err) {
        reject(err)
      } else {
        Promise.all(res.map(file => ({ 
          schema : import(file.replace(__dirname, '.').replace('.ts', '')), 
          schemaName: path.basename(file).replace(path.extname(file), '')}))).then(modules => {
          resolve(modules)
        })
      }
    })
  }).then(modules => {
    // do stuff
  })
  const db = glob.sync('./models/**/*.ts', { cwd: __dirname })
    .map((file) => {
      return {
        schema: import(file),
        schemaName: path.basename(file).replace(path.extname(file), ''),
      }
    })
    .map(async (importPromise) => {
      const {schemaName, schema: schemaP} = importPromise;
      const schema = await schemaP;
     return mongoose.model(schemaName, schema); })
    .reduce(async (db, model) => {
      const resolvedModel = await model;
      return {
        ...db,
        [resolvedModel.name]: resolvedModel,
      }
    }, {});
  mongoose
    .connection
    .on('error', error => {
      throw error
    })
    .once('open', () => logger.info(`MongoDB connected at ${url}`));
  return db;
}
