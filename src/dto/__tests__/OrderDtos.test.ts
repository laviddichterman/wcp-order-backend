import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  OrderIdParams,
  QueryOrdersDto,
  CreateOrderDto,
  CancelOrderDto,
  ConfirmOrderDto,
  MoveOrderDto,
  RescheduleOrderDto
} from '../order/OrderDtos';
import { CURRENCY, DiscountMethod, PaymentMethod, TenderBaseStatus, WFulfillmentStatus } from '@wcp/wario-shared';

describe('Order DTOs', () => {
  describe('OrderIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(OrderIdParams, {
        oId: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ObjectId', async () => {
      const dto = plainToInstance(OrderIdParams, {
        oId: 'invalid-id'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty string', async () => {
      const dto = plainToInstance(OrderIdParams, { oId: '' });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing oId', async () => {
      const dto = plainToInstance(OrderIdParams, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('QueryOrdersDto', () => {
    it('should accept valid ISO8601 date', async () => {
      const dto = plainToInstance(QueryOrdersDto, {
        date: '2024-01-15T10:30:00Z'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid status string', async () => {
      const dto = plainToInstance(QueryOrdersDto, {
        status: 'COMPLETED'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept both date and status', async () => {
      const dto = plainToInstance(QueryOrdersDto, {
        date: '2024-01-15T10:30:00Z',
        status: 'PENDING'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty object (all optional)', async () => {
      const dto = plainToInstance(QueryOrdersDto, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ISO8601 date', async () => {
      const dto = plainToInstance(QueryOrdersDto, {
        date: 'not-a-date'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateOrderDto', () => {
    const validOrderData = {
      fulfillment: {
        status: WFulfillmentStatus.PROPOSED,
        selectedService: 'validFulfillmentId',
        selectedDate: '2024-01-20T00:00:00Z',
        selectedTime: 720
      },
      customerInfo: {
        givenName: 'John',
        familyName: 'Doe',
        mobileNum: '+1234567890',
        email: 'john.doe@example.com'
      },
      proposedDiscounts: [],
      proposedPayments: [
        {
          t: PaymentMethod.CreditCard,
          status: TenderBaseStatus.PROPOSED
        }
      ],
      cart: [
        {
          categoryId: '507f1f77bcf86cd799439011',
          quantity: 2,
          product: { id: 'product1' }
        }
      ],
      tip: {
        isSuggestion: true,
        isPercentage: false
      }
    };

    it('should accept valid order data', async () => {
      const dto = plainToInstance(CreateOrderDto, validOrderData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept order with special instructions', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        specialInstructions: 'Please ring doorbell'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid fulfillment status', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        fulfillment: {
          ...validOrderData.fulfillment,
          status: 'INVALID_STATUS'
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid selected time (> 1440)', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        fulfillment: {
          ...validOrderData.fulfillment,
          selectedTime: 1500
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid selected time (< 0)', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        fulfillment: {
          ...validOrderData.fulfillment,
          selectedTime: -10
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid email', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        customerInfo: {
          ...validOrderData.customerInfo,
          email: 'not-an-email'
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty givenName', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        customerInfo: {
          ...validOrderData.customerInfo,
          givenName: ''
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject cart with quantity < 1', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        cart: [
          {
            categoryId: '507f1f77bcf86cd799439011',
            quantity: 0,
            product: { id: 'product1' }
          }
        ]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid categoryId in cart', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        cart: [
          {
            categoryId: 'invalid-id',
            quantity: 2,
            product: { id: 'product1' }
          }
        ]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid proposed discount', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        proposedDiscounts: [
          {
            t: DiscountMethod.CreditCodeAmount,
            status: TenderBaseStatus.AUTHORIZED,
            discount: {
              amount: { amount: 500, currency: CURRENCY.USD },
              balance: { amount: 1000, currency: CURRENCY.USD },
              code: '1234-5678-9012-3456',
              lock: { enc: 'encrypted', iv: 'iv', auth: 'auth' }
            }
          }
        ]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject discount with invalid code length', async () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...validOrderData,
        proposedDiscounts: [
          {
            t: DiscountMethod.CreditCodeAmount,
            status: TenderBaseStatus.AUTHORIZED,
            discount: {
              amount: { amount: 500, currency: CURRENCY.USD },
              balance: { amount: 1000, currency: CURRENCY.USD },
              code: 'SHORT',
              lock: { enc: 'encrypted', iv: 'iv', auth: 'auth' }
            }
          }
        ]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CancelOrderDto', () => {
    it('should accept valid cancel data', async () => {
      const dto = plainToInstance(CancelOrderDto, {
        reason: 'Customer requested cancellation',
        emailCustomer: true
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept with refundToOriginalPayment', async () => {
      const dto = plainToInstance(CancelOrderDto, {
        reason: 'Out of stock',
        emailCustomer: false,
        refundToOriginalPayment: true
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing reason', async () => {
      const dto = plainToInstance(CancelOrderDto, {
        emailCustomer: true
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing emailCustomer', async () => {
      const dto = plainToInstance(CancelOrderDto, {
        reason: 'Test reason'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ConfirmOrderDto', () => {
    it('should accept valid confirm data', async () => {
      const dto = plainToInstance(ConfirmOrderDto, {
        additionalMessage: 'Order confirmed, ready in 30 minutes'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty string', async () => {
      const dto = plainToInstance(ConfirmOrderDto, {
        additionalMessage: ''
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing additionalMessage', async () => {
      const dto = plainToInstance(ConfirmOrderDto, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('MoveOrderDto', () => {
    it('should accept valid move data', async () => {
      const dto = plainToInstance(MoveOrderDto, {
        destination: 'KITCHEN',
        additionalMessage: 'Moving to kitchen queue'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing destination', async () => {
      const dto = plainToInstance(MoveOrderDto, {
        additionalMessage: 'Test message'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing additionalMessage', async () => {
      const dto = plainToInstance(MoveOrderDto, {
        destination: 'KITCHEN'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('RescheduleOrderDto', () => {
    it('should accept valid reschedule data', async () => {
      const dto = plainToInstance(RescheduleOrderDto, {
        selectedDate: '2024-01-25T00:00:00Z',
        selectedTime: 900,
        emailCustomer: true,
        additionalMessage: 'Rescheduled due to weather'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid time (> 1440)', async () => {
      const dto = plainToInstance(RescheduleOrderDto, {
        selectedDate: '2024-01-25T00:00:00Z',
        selectedTime: 1500,
        emailCustomer: true,
        additionalMessage: 'Test'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid time (< 0)', async () => {
      const dto = plainToInstance(RescheduleOrderDto, {
        selectedDate: '2024-01-25T00:00:00Z',
        selectedTime: -5,
        emailCustomer: true,
        additionalMessage: 'Test'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid date format', async () => {
      const dto = plainToInstance(RescheduleOrderDto, {
        selectedDate: 'not-a-date',
        selectedTime: 900,
        emailCustomer: true,
        additionalMessage: 'Test'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing required fields', async () => {
      const dto = plainToInstance(RescheduleOrderDto, {
        selectedDate: '2024-01-25T00:00:00Z'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
