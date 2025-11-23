import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  BlockOffDto,
  LeadTimeDto,
  SettingsDto
} from '../settings/SettingsDtos';
import { KeyValueStoreDto } from '../settings/KeyValueStoreDtos';

describe('Settings DTOs', () => {
  describe('BlockOffDto', () => {
    const validBlockOffData = {
      fulfillmentIds: ['delivery', 'pickup'],
      date: '2024-01-20T00:00:00Z',
      interval: {
        start: 600,
        end: 900
      }
    };

    it('should accept valid block off data', async () => {
      const dto = plainToInstance(BlockOffDto, validBlockOffData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty fulfillmentIds array', async () => {
      const dto = plainToInstance(BlockOffDto, {
        ...validBlockOffData,
        fulfillmentIds: []
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid ISO8601 date', async () => {
      const dto = plainToInstance(BlockOffDto, {
        ...validBlockOffData,
        date: 'not-a-date'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject interval start > 1440', async () => {
      const dto = plainToInstance(BlockOffDto, {
        ...validBlockOffData,
        interval: { start: 1500, end: 900 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject interval end > 1440', async () => {
      const dto = plainToInstance(BlockOffDto, {
        ...validBlockOffData,
        interval: { start: 600, end: 1500 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative interval start', async () => {
      const dto = plainToInstance(BlockOffDto, {
        ...validBlockOffData,
        interval: { start: -10, end: 900 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative interval end', async () => {
      const dto = plainToInstance(BlockOffDto, {
        ...validBlockOffData,
        interval: { start: 600, end: -10 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('LeadTimeDto', () => {
    it('should accept valid lead times with valid fulfillment keys', async () => {
      const dto = plainToInstance(LeadTimeDto, {
        leadTimes: {
          'delivery': 45,
          'pickup': 30,
          'dinein': 20
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid fulfillment keys', async () => {
      const dto = plainToInstance(LeadTimeDto, {
        leadTimes: {
          'delivery': 45,
          'invalidFulfillment': 30
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.areKeysValidFulfillments).toContain('Unable to find fulfillments');
    });

    it('should reject non-object leadTimes', async () => {
      const dto = plainToInstance(LeadTimeDto, {
        leadTimes: 'not an object'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept empty object', async () => {
      const dto = plainToInstance(LeadTimeDto, {
        leadTimes: {}
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('SettingsDto', () => {
    it('should accept valid settings data', async () => {
      const dto = plainToInstance(SettingsDto, {
        additional_pizza_lead_time: 5
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept zero lead time', async () => {
      const dto = plainToInstance(SettingsDto, {
        additional_pizza_lead_time: 0
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative lead time', async () => {
      const dto = plainToInstance(SettingsDto, {
        additional_pizza_lead_time: -5
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing lead time', async () => {
      const dto = plainToInstance(SettingsDto, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('KeyValueStoreDto', () => {
    it('should accept valid key-value pairs where all values are strings', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: {
          'key1': 'value1',
          'key2': 'value2',
          'key3': 'value3'
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty object', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: {}
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject when a value is not a string (number)', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: {
          'key1': 'value1',
          'key2': 123
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isStringRecord).toContain('Misformed value found for key');
    });

    it('should reject when a value is not a string (boolean)', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: {
          'key1': 'value1',
          'key2': true
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject when a value is not a string (object)', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: {
          'key1': 'value1',
          'key2': { nested: 'object' }
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject when data is not an object', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: 'not an object'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isStringRecord).toBe('Body must be an object');
    });

    it('should reject when data is null', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: null
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept single key-value pair', async () => {
      const dto = plainToInstance(KeyValueStoreDto, {
        data: {
          'onlyKey': 'onlyValue'
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
