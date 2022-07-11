import Promise from 'bluebird';
import logger from "./logging";

export const ExponentialBackoff = async (fxn : any, retry_checker : (err : Error) => boolean, retry : number, max_retry : number) => {
  try {
    const response = await fxn();
    return response;
  }    
  catch (err) {
    if (retry < max_retry && retry_checker(err)) {
      const waittime = (2 ** (retry+1) * 10) + 1000*(Math.random());
      logger.warn(`Waiting ${waittime} on retry ${retry+1} of ${max_retry}`);
      await new Promise((res) => setTimeout(res, waittime));
      return await ExponentialBackoff(fxn, retry_checker, retry+1, max_retry);
    }
    else {
      throw err;
    }
  }
}


exports.ExponentialBackoff = ExponentialBackoff;
