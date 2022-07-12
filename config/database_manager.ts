import logger from '../logging';
import {Promise} from 'bluebird';
import PACKAGE_JSON from '../package.json';
import { CURRENCY, SEMVER } from '@wcp/wcpshared';
import DBVersionModel from '../models/DBVersionSchema';
import WProductInstanceModel from '../models/ordering/products/WProductInstanceSchema';
import WProductModel from '../models/ordering/products/WProductSchema';
import SettingsModel from '../models/settings/SettingsSchema';

const SetVersion = async (new_version : SEMVER) => { 
  return await DBVersionModel.findOneAndUpdate({}, new_version, {new: true, upsert: true});
}

interface IMigrationFunctionObject {
  [index:string]: [SEMVER, () => Promise<void>]
}
const UPGRADE_MIGRATION_FUNCTIONS : IMigrationFunctionObject = {
  "0.2.21": [{ major: 0, minor: 2, patch: 22 }, async () => {
    { 
    
    }
  }],
}

class DatabaseManager {
  #DBVersionSchema: typeof DBVersionModel;
  constructor() {
  }

  Bootstrap = async (cb : any) => {
    const [VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH] = PACKAGE_JSON.version.split(".", 3).map(x => parseInt(x));
    const VERSION_PACKAGE = { major: VERSION_MAJOR, minor: VERSION_MINOR, patch: VERSION_PATCH };

    // load version from the DB
    logger.info("Running database upgrade bootstrap.");

    var current_db_version = "0.0.0";

    const db_version = await this.#DBVersionSchema.find({});
    if (db_version.length > 1) {
      logger.error(`Found more than one DB version entry: ${JSON.stringify(db_version)}, deleting all.`);
      await this.#DBVersionSchema.deleteMany({});
    }
    else if (db_version.length === 1) {
      current_db_version = `${db_version[0].major}.${db_version[0].minor}.${db_version[0].patch}`;
    }

    // run update loop
    while (PACKAGE_JSON.version !== current_db_version) {
      if (Object.hasOwn(UPGRADE_MIGRATION_FUNCTIONS, current_db_version)) {
        const [next_ver, migration_function] = UPGRADE_MIGRATION_FUNCTIONS[current_db_version];
        const next_ver_string = `${next_ver.major}.${next_ver.minor}.${next_ver.patch}`;
        logger.info(`Running migration function from ${current_db_version} to ${next_ver_string}`);
        await migration_function();
        await SetVersion(next_ver);
        current_db_version = next_ver_string;
      }
      else {
        logger.warn(`No explicit migration from ${current_db_version} to ${PACKAGE_JSON.version}, setting to new version.`);
        await SetVersion(VERSION_PACKAGE);
        current_db_version = PACKAGE_JSON.version;
      }
    }

    logger.info("Database upgrade checks completed.");
    if (cb) {
      return await cb();
    }
  };


}

module.exports = ({ }) => {
  return new DatabaseManager();
}