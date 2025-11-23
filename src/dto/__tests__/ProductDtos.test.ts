import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ProductIdParams,
  ProductInstanceIdParams,
  ProductAndInstanceIdParams,
  ProductInstanceDto,
  ProductClassDto,
  CreateProductDto,
  BatchCreateProductsDto,
  BatchDeleteProductsDto
} from '../product/ProductDtos';
import { CURRENCY, OptionPlacement, OptionQualifier, PriceDisplay } from '@wcp/wario-shared';

describe('Product DTOs', () => {
  describe('ProductIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(ProductIdParams, {
        pid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ObjectId', async () => {
      const dto = plainToInstance(ProductIdParams, { pid: 'invalid-id' });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ProductInstanceIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(ProductInstanceIdParams, {
        piid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ObjectId', async () => {
      const dto = plainToInstance(ProductInstanceIdParams, { piid: 'invalid' });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ProductAndInstanceIdParams', () => {
    it('should accept both valid ObjectIds', async () => {
      const dto = plainToInstance(ProductAndInstanceIdParams, {
        pid: '507f1f77bcf86cd799439011',
        piid: '507f1f77bcf86cd799439012'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject if pid is invalid', async () => {
      const dto = plainToInstance(ProductAndInstanceIdParams, {
        pid: 'invalid',
        piid: '507f1f77bcf86cd799439012'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject if piid is invalid', async () => {
      const dto = plainToInstance(ProductAndInstanceIdParams, {
        pid: '507f1f77bcf86cd799439011',
        piid: 'invalid'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ProductInstanceDto', () => {
    const validInstanceData = {
      displayName: 'Large Pizza',
      description: 'Large 14" pizza',
      shortcode: 'LRG',
      externalIDs: [
        { key: 'square_id', value: 'sq_12345' }
      ],
      displayFlags: {
        pos: {
          name: 'L Pizza',
          hide: false,
          skip_customization: false
        },
        menu: {
          ordinal: 1,
          hide: false,
          price_display: PriceDisplay.ALWAYS,
          adornment: '',
          suppress_exhaustive_modifier_list: false,
          show_modifier_options: true
        },
        order: {
          ordinal: 1,
          hide: false,
          skip_customization: false,
          price_display: PriceDisplay.ALWAYS,
          adornment: '',
          suppress_exhaustive_modifier_list: false
        }
      },
      ordinal: 0,
      modifiers: [
        {
          modifierTypeId: '507f1f77bcf86cd799439011',
          options: [
            {
              optionId: '507f1f77bcf86cd799439012',
              placement: OptionPlacement.WHOLE,
              qualifier: OptionQualifier.REGULAR
            }
          ]
        }
      ]
    };

    it('should accept valid product instance data', async () => {
      const dto = plainToInstance(ProductInstanceDto, validInstanceData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty shortcode', async () => {
      const dto = plainToInstance(ProductInstanceDto, {
        ...validInstanceData,
        shortcode: ''
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative ordinal', async () => {
      const dto = plainToInstance(ProductInstanceDto, {
        ...validInstanceData,
        ordinal: -1
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid modifier option placement', async () => {
      const dto = plainToInstance(ProductInstanceDto, {
        ...validInstanceData,
        modifiers: [
          {
            modifierTypeId: '507f1f77bcf86cd799439011',
            options: [
              {
                optionId: '507f1f77bcf86cd799439012',
                placement: 'INVALID_PLACEMENT',
                qualifier: OptionQualifier.REGULAR
              }
            ]
          }
        ]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid ObjectId in modifierTypeId', async () => {
      const dto = plainToInstance(ProductInstanceDto, {
        ...validInstanceData,
        modifiers: [
          {
            modifierTypeId: 'invalid-id',
            options: []
          }
        ]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ProductClassDto', () => {
    const validProductData = {
      price: {
        amount: 1299,
        currency: CURRENCY.USD
      },
      disabled: null,
      externalIDs: [],
      modifiers: [],
      category_ids: ['507f1f77bcf86cd799439011'],
      displayFlags: {
        flavor_max: 3,
        bake_max: 2,
        bake_differential: 1,
        show_name_of_base_product: true,
        singular_noun: 'pizza',
        is3p: false,
        order_guide: {
          warnings: [],
          suggestions: []
        }
      }
    };

    it('should accept valid product class data', async () => {
      const dto = plainToInstance(ProductClassDto, validProductData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid disabled value', async () => {
      const dto = plainToInstance(ProductClassDto, {
        ...validProductData,
        disabled: { start: 100, end: 200 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative price amount', async () => {
      const dto = plainToInstance(ProductClassDto, {
        ...validProductData,
        price: {
          amount: -100,
          currency: CURRENCY.USD
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid currency', async () => {
      const dto = plainToInstance(ProductClassDto, {
        ...validProductData,
        price: {
          amount: 1299,
          currency: 'INVALID_CURRENCY'
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept optional printerGroup', async () => {
      const dto = plainToInstance(ProductClassDto, {
        ...validProductData,
        printerGroup: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid printerGroup ObjectId', async () => {
      const dto = plainToInstance(ProductClassDto, {
        ...validProductData,
        printerGroup: 'invalid-id'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept null printerGroup', async () => {
      const dto = plainToInstance(ProductClassDto, {
        ...validProductData,
        printerGroup: null
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative flavor_max', async () => {
      const dto = plainToInstance(ProductClassDto, {
        ...validProductData,
        displayFlags: {
          ...validProductData.displayFlags,
          flavor_max: -1
        }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateProductDto', () => {
    const validProductInstanceData = {
      displayName: 'Small Pizza',
      description: 'Small 10" pizza',
      shortcode: 'SML',
      externalIDs: [],
      displayFlags: {
        pos: { name: null, hide: false, skip_customization: false },
        menu: {
          ordinal: 0,
          hide: false,
          price_display: PriceDisplay.ALWAYS,
          adornment: '',
          suppress_exhaustive_modifier_list: false,
          show_modifier_options: true
        },
        order: {
          ordinal: 0,
          hide: false,
          skip_customization: false,
          price_display: PriceDisplay.ALWAYS,
          adornment: '',
          suppress_exhaustive_modifier_list: false
        }
      },
      ordinal: 0,
      modifiers: []
    };

    const validCreateProductData = {
      product: {
        price: { amount: 999, currency: CURRENCY.USD },
        disabled: null,
        externalIDs: [],
        modifiers: [],
        category_ids: ['507f1f77bcf86cd799439011'],
        displayFlags: {
          flavor_max: 3,
          bake_max: 2,
          bake_differential: 1,
          show_name_of_base_product: true,
          singular_noun: 'pizza',
          is3p: false,
          order_guide: { warnings: [], suggestions: [] }
        }
      },
      instances: [validProductInstanceData]
    };

    it('should accept valid create product data', async () => {
      const dto = plainToInstance(CreateProductDto, validCreateProductData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept multiple instances', async () => {
      const dto = plainToInstance(CreateProductDto, {
        ...validCreateProductData,
        instances: [
          validProductInstanceData,
          { ...validProductInstanceData, displayName: 'Medium Pizza', shortcode: 'MED' }
        ]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty instances array', async () => {
      const dto = plainToInstance(CreateProductDto, {
        ...validCreateProductData,
        instances: []
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing product', async () => {
      const dto = plainToInstance(CreateProductDto, {
        instances: [validProductInstanceData]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing instances', async () => {
      const dto = plainToInstance(CreateProductDto, {
        product: validCreateProductData.product
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('BatchCreateProductsDto', () => {
    const validProductData = {
      product: {
        price: { amount: 999, currency: CURRENCY.USD },
        disabled: null,
        externalIDs: [],
        modifiers: [],
        category_ids: ['507f1f77bcf86cd799439011'],
        displayFlags: {
          flavor_max: 3,
          bake_max: 2,
          bake_differential: 1,
          show_name_of_base_product: true,
          singular_noun: 'pizza',
          is3p: false,
          order_guide: { warnings: [], suggestions: [] }
        }
      },
      instances: [{
        displayName: 'Small Pizza',
        description: 'Small 10" pizza',
        shortcode: 'SML',
        externalIDs: [],
        displayFlags: {
          pos: { name: null, hide: false, skip_customization: false },
          menu: {
            ordinal: 0,
            hide: false,
            price_display: PriceDisplay.ALWAYS,
            adornment: '',
            suppress_exhaustive_modifier_list: false,
            show_modifier_options: true
          },
          order: {
            ordinal: 0,
            hide: false,
            skip_customization: false,
            price_display: PriceDisplay.ALWAYS,
            adornment: '',
            suppress_exhaustive_modifier_list: false
          }
        },
        ordinal: 0,
        modifiers: []
      }]
    };

    it('should accept valid batch create data', async () => {
      const dto = plainToInstance(BatchCreateProductsDto, {
        products: [validProductData]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept multiple products', async () => {
      const dto = plainToInstance(BatchCreateProductsDto, {
        products: [validProductData, validProductData]
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty products array', async () => {
      const dto = plainToInstance(BatchCreateProductsDto, {
        products: []
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing products', async () => {
      const dto = plainToInstance(BatchCreateProductsDto, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('BatchDeleteProductsDto', () => {
    it('should accept valid product IDs array', async () => {
      const dto = plainToInstance(BatchDeleteProductsDto, {
        pids: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty pids array', async () => {
      const dto = plainToInstance(BatchDeleteProductsDto, {
        pids: []
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing pids', async () => {
      const dto = plainToInstance(BatchDeleteProductsDto, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
