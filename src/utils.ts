import logger from "./logging";

export async function ExponentialBackoff<T>(
  request : () => Promise<T>, 
  retry_checker : (err : Error) => boolean, 
  retry : number, 
  max_retry : number): Promise<T> {
  try {
    const response = await request();
    return response;
  }    
  catch (err) {
    if (retry < max_retry && retry_checker(err)) {
      const waittime = (2 ** (retry+1) * 10) + 1000*(Math.random());
      logger.warn(`Waiting ${waittime} on retry ${retry+1} of ${max_retry}`);
      await new Promise((res) => setTimeout(res, waittime));
      return await ExponentialBackoff<T>(request, retry_checker, retry+1, max_retry);
    }
    else {
      throw err;
    }
  }
}

export const BigIntStringify = (str : any) => (
  JSON.stringify(str, (_, value) =>
            typeof value === 'bigint'
                ? Number(value)
                : value // return everything else unchanged
        ) )



exports.ExponentialBackoff = ExponentialBackoff;
