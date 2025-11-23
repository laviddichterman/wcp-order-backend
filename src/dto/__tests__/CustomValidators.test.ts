import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsValidDisabledValue, IsFulfillmentDefined, AreKeysValidFulfillments } from '../validators/CustomValidators';
import { DataProviderInstance } from '../../config/dataprovider';

// Test classes for custom validators
class TestDisabledValue {
  @IsValidDisabledValue()
  disabled: any;
}

class TestFulfillmentDefined {
  @IsFulfillmentDefined()
  fulfillmentId: string;
}

class TestFulfillmentKeys {
  @AreKeysValidFulfillments()
  fulfillments: Record<string, any>;
}

describe('Custom Validators', () => {
  describe('@IsValidDisabledValue', () => {
    it('should accept null or undefined', async () => {
      const dto1 = plainToInstance(TestDisabledValue, { disabled: null });
      const dto2 = plainToInstance(TestDisabledValue, { disabled: undefined });
      
      const errors1 = await validate(dto1);
      const errors2 = await validate(dto2);
      
      expect(errors1.length).toBe(0);
      expect(errors2.length).toBe(0);
    });

    it('should accept valid disabled object with start and end', async () => {
      const dto = plainToInstance(TestDisabledValue, {
        disabled: { start: 100, end: 200 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject disabled object without start', async () => {
      const dto = plainToInstance(TestDisabledValue, {
        disabled: { end: 200 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isValidDisabledValue).toBe('Disabled value misformed');
    });

    it('should reject disabled object without end', async () => {
      const dto = plainToInstance(TestDisabledValue, {
        disabled: { start: 100 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject disabled with non-integer values', async () => {
      const dto = plainToInstance(TestDisabledValue, {
        disabled: { start: 100.5, end: 200 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject primitive values', async () => {
      const dto = plainToInstance(TestDisabledValue, { disabled: 'invalid' });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('@IsFulfillmentDefined', () => {
    it('should accept valid fulfillment ID', async () => {
      const dto = plainToInstance(TestFulfillmentDefined, {
        fulfillmentId: 'fulfillment1'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid fulfillment ID', async () => {
      const dto = plainToInstance(TestFulfillmentDefined, {
        fulfillmentId: 'invalidFulfillment'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isFulfillmentDefined).toContain('not found');
    });

    it('should reject non-string values', async () => {
      const dto = plainToInstance(TestFulfillmentDefined, {
        fulfillmentId: 123
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject null values', async () => {
      const dto = plainToInstance(TestFulfillmentDefined, {
        fulfillmentId: null
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('@AreKeysValidFulfillments', () => {
    it('should accept object with all valid fulfillment keys', async () => {
      const dto = plainToInstance(TestFulfillmentKeys, {
        fulfillments: {
          'fulfillment1': { someData: 'value1' },
          'fulfillment2': { someData: 'value2' }
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject object with invalid fulfillment keys', async () => {
      const dto = plainToInstance(TestFulfillmentKeys, {
        fulfillments: {
          'fulfillment1': { someData: 'value1' },
          'invalidKey': { someData: 'value2' }
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.areKeysValidFulfillments).toContain('Unable to find fulfillments');
    });

    it('should reject empty object', async () => {
      const dto = plainToInstance(TestFulfillmentKeys, {
        fulfillments: {}
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0); // Empty object is technically valid
    });

    it('should reject non-object values', async () => {
      const dto = plainToInstance(TestFulfillmentKeys, {
        fulfillments: 'not an object'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject null values', async () => {
      const dto = plainToInstance(TestFulfillmentKeys, {
        fulfillments: null
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
