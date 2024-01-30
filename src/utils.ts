// import { RetryConfiguration } from "square/dist/core";
import logger from "./logging";

export const IS_PRODUCTION = process.env.NODE_ENV !== 'development';


// /**
//  * Returns wait time for the request
//  * @param retryConfig Configuration for retry
//  * @param method HttpMethod of the request
//  * @param allowedWaitTime Remaining allowed wait time
//  * @param retryCount Retry attempt number
//  * @param httpCode Status code received
//  * @param headers Response headers
//  * @param timeoutError Error from the server
//  * @returns Wait time before the retry
//  */
// function getRetryWaitTime(retryConfig: RetryConfiguration, allowedWaitTime: number, retryCount : number, httpCode :number, headers: Record<string, string>, timeoutError: boolean) {
//     let retryWaitTime = 0.0;
//     let retry = false;
//     let retryAfter = 0;
//     if (retryCount < retryConfig.maxNumberOfRetries) {
//         if (timeoutError) {
//             retry = retryConfig.retryOnTimeout;
//         }
//         else if (typeof headers !== 'undefined' &&
//             typeof httpCode !== 'undefined') {
//             retryAfter = getRetryAfterSeconds(headers);
//             retry =
//                 retryAfter > 0 || retryConfig.httpStatusCodesToRetry.includes(httpCode);
//         }
//         if (retry) {
//             var noise = +(Math.random() / 100).toFixed(3);
//             var waitTime = retryConfig.retryInterval *
//                 Math.pow(retryConfig.backoffFactor, retryCount) +
//                 noise;
//             waitTime = Math.max(waitTime, retryAfter);
//             if (waitTime <= allowedWaitTime) {
//                 retryWaitTime = waitTime;
//             }
//         }
//     }
//     return retryWaitTime;
// }
// exports.getRetryWaitTime = getRetryWaitTime;
// function getRetryAfterSeconds(headers: Record<string, string>) {
//   const retryAfter = Object.hasOwn()
//     if (retryAfter == null) {
//         return 0;
//     }
//     if (isNaN(+retryAfter)) {
//         var timeDifference = (new Date(retryAfter).getTime() - Date.now()) / 1000;
//         return isNaN(timeDifference) ? 0 : timeDifference;
//     }
//     return +retryAfter;
// }
// function shouldRetryRequest(retryConfig, retryOption, httpMethod) {
//     switch (retryOption) {
//         case RequestRetryOption.Default:
//             return retryConfig.httpMethodsToRetry.includes(httpMethod);
//         case RequestRetryOption.Enable:
//             return true;
//         case RequestRetryOption.Disable:
//             return false;
//     }
// }

export async function ExponentialBackoffWaitFunction(retry: number, max_retry: number) {
  const waittime = (2 ** (retry+1) * 10) + 1000*(Math.random());
  logger.warn(`Waiting ${waittime} on retry ${retry+1} of ${max_retry}`);
  return await new Promise((res) => setTimeout(res, waittime));
}

export async function ExponentialBackoff<T>(
  request : () => Promise<T>, 
  retry_checker : (err : unknown) => boolean, 
  retry : number, 
  max_retry : number): Promise<T> {
  try {
    const response = await request();
    return response;
  }    
  catch (err) {
    if (retry_checker(err)) {
      if (retry < max_retry && retry_checker(err)) {
        await ExponentialBackoffWaitFunction(retry, max_retry);
        return await ExponentialBackoff<T>(request, retry_checker, retry+1, max_retry);
      }
      else {
        throw err;
      }  
    }
    return err;
  }
}

export const BigIntStringify = (str : any) => (
  JSON.stringify(str, (_, value) =>
            typeof value === 'bigint'
                ? BigInt(value)
                : value // return everything else unchanged
        ) )

export const IsSetOfUniqueStrings = ( arr: string[] ) => (new Set(arr)).size === arr.length;