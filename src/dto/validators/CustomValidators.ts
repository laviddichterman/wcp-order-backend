import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { DataProviderInstance } from '../../config/dataprovider';

export function IsValidDisabledValue(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidDisabledValue',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value || (typeof value === 'object' && "start" in value && "end" in value && Number.isInteger(value.start) && Number.isInteger(value.end))) {
            return true;
          }
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          return 'Disabled value misformed';
        }
      }
    });
  };
}

export function IsFulfillmentDefined(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isFulfillmentDefined',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value && typeof value === 'string') {
            return Object.hasOwn(DataProviderInstance.Fulfillments, value);
          }
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          return `Fulfillment ID ${args.value} not found`;
        }
      }
    });
  };
}

export function AreKeysValidFulfillments(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'areKeysValidFulfillments',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value && typeof value === 'object') {
            const notFoundKeys = Object.keys(value).filter(x => !Object.hasOwn(DataProviderInstance.Fulfillments, x));
            return notFoundKeys.length === 0;
          }
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          if (args.value && typeof args.value === 'object') {
            const notFoundKeys = Object.keys(args.value).filter(x => !Object.hasOwn(DataProviderInstance.Fulfillments, x));
            return `Unable to find fulfillments for ${notFoundKeys.join(", ")}`;
          }
          return 'Invalid fulfillments object';
        }
      }
    });
  };
}
