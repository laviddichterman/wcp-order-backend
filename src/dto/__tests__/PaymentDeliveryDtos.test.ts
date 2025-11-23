import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreditCodeQuery,
  PurchaseStoreCreditDto,
  SpendStoreCreditDto,
  IssueStoreCreditDto
} from '../payment/StoreCreditDtos';
import { DeliveryAddressValidateDto } from '../delivery/DeliveryAddressDtos';
import { ProductInstanceFunctionIdParams, ProductInstanceFunctionDto } from '../product/ProductInstanceFunctionDtos';
import { CURRENCY, StoreCreditType } from '@wcp/wario-shared';

describe('Payment and Delivery DTOs', () => {
  describe('CreditCodeQuery', () => {
    it('should accept valid 19-character code', async () => {
      const dto = plainToInstance(CreditCodeQuery, {
        code: '1234-5678-9012-3456'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject code shorter than 19 characters', async () => {
      const dto = plainToInstance(CreditCodeQuery, {
        code: '1234-5678'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject code longer than 19 characters', async () => {
      const dto = plainToInstance(CreditCodeQuery, {
        code: '1234-5678-9012-3456-7890'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing code', async () => {
      const dto = plainToInstance(CreditCodeQuery, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('PurchaseStoreCreditDto', () => {
    const validPurchaseData = {
      amount: { amount: 5000, currency: CURRENCY.USD },
      senderName: 'John Doe',
      senderEmail: 'john@example.com',
      recipientNameFirst: 'Jane',
      recipientNameLast: 'Smith',
      sendEmailToRecipient: true
    };

    it('should accept valid purchase data', async () => {
      const dto = plainToInstance(PurchaseStoreCreditDto, validPurchaseData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept with optional recipientEmail and recipientMessage', async () => {
      const dto = plainToInstance(PurchaseStoreCreditDto, {
        ...validPurchaseData,
        recipientEmail: 'jane@example.com',
        recipientMessage: 'Happy Birthday!'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject amount less than 1', async () => {
      const dto = plainToInstance(PurchaseStoreCreditDto, {
        ...validPurchaseData,
        amount: { amount: 0, currency: CURRENCY.USD }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid senderEmail', async () => {
      const dto = plainToInstance(PurchaseStoreCreditDto, {
        ...validPurchaseData,
        senderEmail: 'not-an-email'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid recipientEmail when provided', async () => {
      const dto = plainToInstance(PurchaseStoreCreditDto, {
        ...validPurchaseData,
        recipientEmail: 'not-an-email'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid currency', async () => {
      const dto = plainToInstance(PurchaseStoreCreditDto, {
        ...validPurchaseData,
        amount: { amount: 5000, currency: 'INVALID' }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SpendStoreCreditDto', () => {
    const validSpendData = {
      code: '1234-5678-9012-3456',
      amount: { amount: 1000, currency: CURRENCY.USD },
      updatedBy: { id: 'user123' },
      lock: {
        enc: 'encrypted_data',
        iv: 'initialization_vector',
        auth: 'auth_tag'
      }
    };

    it('should accept valid spend data', async () => {
      const dto = plainToInstance(SpendStoreCreditDto, validSpendData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid code length', async () => {
      const dto = plainToInstance(SpendStoreCreditDto, {
        ...validSpendData,
        code: 'SHORT'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject amount less than 1', async () => {
      const dto = plainToInstance(SpendStoreCreditDto, {
        ...validSpendData,
        amount: { amount: 0, currency: CURRENCY.USD }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing lock', async () => {
      const dto = plainToInstance(SpendStoreCreditDto, {
        code: '1234-5678-9012-3456',
        amount: { amount: 1000, currency: CURRENCY.USD },
        updatedBy: { id: 'user123' }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject incomplete lock object', async () => {
      const dto = plainToInstance(SpendStoreCreditDto, {
        ...validSpendData,
        lock: {
          enc: 'encrypted_data',
          iv: 'initialization_vector'
          // missing auth
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IssueStoreCreditDto', () => {
    const validIssueData = {
      amount: { amount: 2500, currency: CURRENCY.USD },
      recipientNameFirst: 'Jane',
      recipientNameLast: 'Doe',
      recipientEmail: 'jane@example.com',
      creditType: StoreCreditType.MONEY,
      addedBy: 'admin@example.com',
      reason: 'Customer complaint resolution'
    };

    it('should accept valid issue data', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, validIssueData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept with optional expiration', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        expiration: '2025-12-31T23:59:59Z'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject amount less than 1', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        amount: { amount: 0, currency: CURRENCY.USD }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty recipientNameFirst', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        recipientNameFirst: ''
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty recipientNameLast', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        recipientNameLast: ''
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid email', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        recipientEmail: 'not-an-email'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid creditType', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        creditType: 'INVALID_TYPE'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty reason', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        reason: ''
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid expiration format', async () => {
      const dto = plainToInstance(IssueStoreCreditDto, {
        ...validIssueData,
        expiration: 'not-a-date'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('DeliveryAddressValidateDto', () => {
    const validAddressData = {
      fulfillmentId: 'delivery',
      address: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zipcode: '62701'
    };

    it('should accept valid delivery address', async () => {
      const dto = plainToInstance(DeliveryAddressValidateDto, validAddressData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid fulfillmentId (not in Fulfillments)', async () => {
      const dto = plainToInstance(DeliveryAddressValidateDto, {
        ...validAddressData,
        fulfillmentId: 'invalidFulfillment'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isFulfillmentDefined).toContain('not found');
    });

    it('should reject invalid MongoDB ObjectId', async () => {
      const dto = plainToInstance(DeliveryAddressValidateDto, {
        ...validAddressData,
        fulfillmentId: 'invalid-id'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing address', async () => {
      const dto = plainToInstance(DeliveryAddressValidateDto, {
        fulfillmentId: 'delivery',
        city: 'Springfield',
        state: 'IL',
        zipcode: '62701'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing city', async () => {
      const dto = plainToInstance(DeliveryAddressValidateDto, {
        fulfillmentId: 'delivery',
        address: '123 Main Street',
        state: 'IL',
        zipcode: '62701'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing state', async () => {
      const dto = plainToInstance(DeliveryAddressValidateDto, {
        fulfillmentId: 'delivery',
        address: '123 Main Street',
        city: 'Springfield',
        zipcode: '62701'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing zipcode', async () => {
      const dto = plainToInstance(DeliveryAddressValidateDto, {
        fulfillmentId: 'delivery',
        address: '123 Main Street',
        city: 'Springfield',
        state: 'IL'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ProductInstanceFunctionIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(ProductInstanceFunctionIdParams, {
        fxnid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ObjectId', async () => {
      const dto = plainToInstance(ProductInstanceFunctionIdParams, {
        fxnid: 'invalid-id'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ProductInstanceFunctionDto', () => {
    it('should accept valid function data', async () => {
      const dto = plainToInstance(ProductInstanceFunctionDto, {
        name: 'Price Calculator',
        expression: { type: 'add', operands: [1, 2] }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing name', async () => {
      const dto = plainToInstance(ProductInstanceFunctionDto, {
        expression: { type: 'add', operands: [1, 2] }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing expression', async () => {
      const dto = plainToInstance(ProductInstanceFunctionDto, {
        name: 'Price Calculator'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept any expression type', async () => {
      const dto = plainToInstance(ProductInstanceFunctionDto, {
        name: 'Complex Calculation',
        expression: 'any complex expression object'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
