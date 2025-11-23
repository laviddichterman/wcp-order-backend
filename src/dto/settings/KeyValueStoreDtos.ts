import { Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'isStringRecord', async: false })
class IsStringRecordConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    
    return Object.keys(value).every(key => typeof value[key] === 'string');
  }

  defaultMessage(args: ValidationArguments) {
    const value = args.value;
    if (typeof value !== 'object') {
      return 'Body must be an object';
    }
    const invalidKeys = Object.keys(value).filter(key => typeof value[key] !== 'string');
    if (invalidKeys.length > 0) {
      return `Misformed value found for key ${invalidKeys[0]}.`;
    }
    return 'Invalid key-value store data';
  }
}

// Body DTOs - This will validate the entire body as a record of strings
export class KeyValueStoreDto {
  @Validate(IsStringRecordConstraint)
  data: any;
}
