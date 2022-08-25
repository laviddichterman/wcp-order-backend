import { CustomValidator } from 'express-validator';
import { DataProviderInstance } from '../config/dataprovider';


export const isValidDisabledValue: CustomValidator = (value) => {
  if (!value || (typeof value === 'object' && "start" in value && "end" in value && Number.isInteger(value.start) && Number.isInteger(value.end))) {
    return true;
  }
  throw new Error("Disabled value misformed");
}

export const areKeysValidFulfillments: CustomValidator = (value) => {
  if (value && typeof value === 'object') {
    const notFoundKeys = Object.keys(value).filter(x=>!Object.hasOwn(DataProviderInstance.Fulfillments, x));
    if (notFoundKeys.length === 0) {
      return true;
    }
    throw new Error(`Unable to find fulfillments for ${notFoundKeys.join(", ")}`)
  }
  throw new Error("Disabled value misformed");
}


export const isFulfillmentDefined: CustomValidator = (value) => {
  if (value && typeof value === 'string') {
    return Object.hasOwn(DataProviderInstance.Fulfillments, value);
  }
  throw new Error("Disabled value misformed");
}
