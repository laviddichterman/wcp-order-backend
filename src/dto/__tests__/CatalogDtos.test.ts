import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CategoryIdParams,
  CategoryDto,
  DeleteCategoryDto
} from '../catalog/CategoryDtos';
import {
  ModifierTypeIdParams,
  ModifierOptionIdParams,
  ModifierTypeAndOptionIdParams,
  ModifierTypeDto,
  ModifierOptionDto
} from '../catalog/ModifierDtos';
import {
  PrinterGroupIdParams,
  PrinterGroupDto,
  DeleteAndReassignPrinterGroupDto
} from '../catalog/PrinterGroupDtos';
import {
  FulfillmentIdParams,
  FulfillmentDto
} from '../catalog/FulfillmentDtos';
import {
  SeatingResourceIdParams,
  SeatingResourceDto
} from '../catalog/SeatingResourceDtos';
import { CALL_LINE_DISPLAY, CategoryDisplay, CURRENCY, DISPLAY_AS, MODIFIER_CLASS, FulfillmentType, SeatingShape } from '@wcp/wario-shared';

describe('Catalog DTOs', () => {
  describe('CategoryIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(CategoryIdParams, {
        catid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ObjectId', async () => {
      const dto = plainToInstance(CategoryIdParams, { catid: 'invalid-id' });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CategoryDto', () => {
    const validCategoryData = {
      name: 'Pizza',
      description: 'Delicious pizzas',
      subheading: 'Made fresh daily',
      footnotes: 'Contains wheat',
      ordinal: 0,
      display_flags: {
        call_line_name: 'PIZZA',
        call_line_display: CALL_LINE_DISPLAY.SHORTCODE,
        nesting: CategoryDisplay.FLAT
      }
    };

    it('should accept valid category data', async () => {
      const dto = plainToInstance(CategoryDto, validCategoryData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept category with parent_id', async () => {
      const dto = plainToInstance(CategoryDto, {
        ...validCategoryData,
        parent_id: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative ordinal', async () => {
      const dto = plainToInstance(CategoryDto, {
        ...validCategoryData,
        ordinal: -1
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid parent_id', async () => {
      const dto = plainToInstance(CategoryDto, {
        ...validCategoryData,
        parent_id: 'invalid-id'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('DeleteCategoryDto', () => {
    it('should accept boolean delete_contained_products', async () => {
      const dto = plainToInstance(DeleteCategoryDto, {
        delete_contained_products: true
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty object (optional field)', async () => {
      const dto = plainToInstance(DeleteCategoryDto, {});
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('ModifierTypeIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(ModifierTypeIdParams, {
        mtid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ObjectId', async () => {
      const dto = plainToInstance(ModifierTypeIdParams, { mtid: 'invalid' });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ModifierOptionIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(ModifierOptionIdParams, {
        moid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('ModifierTypeAndOptionIdParams', () => {
    it('should accept both valid ObjectIds', async () => {
      const dto = plainToInstance(ModifierTypeAndOptionIdParams, {
        mtid: '507f1f77bcf86cd799439011',
        moid: '507f1f77bcf86cd799439012'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('ModifierTypeDto', () => {
    const validModifierTypeData = {
      name: 'Toppings',
      displayName: 'Choose your toppings',
      ordinal: 0,
      min_selected: 0,
      max_selected: 5,
      revelID: false,
      squareID: false,
      externalIDs: [],
      displayFlags: DISPLAY_AS.OMIT,
      use_toggle_if_only_two_options: false,
      hidden: false,
      empty_display_as_message_only: false,
      modifier_class: MODIFIER_CLASS.SIZE
    };

    it('should accept valid modifier type data', async () => {
      const dto = plainToInstance(ModifierTypeDto, validModifierTypeData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject ordinal > 500', async () => {
      const dto = plainToInstance(ModifierTypeDto, {
        ...validModifierTypeData,
        ordinal: 501
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject min_selected > 100', async () => {
      const dto = plainToInstance(ModifierTypeDto, {
        ...validModifierTypeData,
        min_selected: 101
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject max_selected > 100', async () => {
      const dto = plainToInstance(ModifierTypeDto, {
        ...validModifierTypeData,
        max_selected: 101
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ModifierOptionDto', () => {
    const validModifierOptionData = {
      displayName: 'Pepperoni',
      description: 'Spicy pepperoni',
      shortcode: false,
      price: { amount: 150, currency: CURRENCY.USD },
      disabled: null,
      externalIDs: [],
      enable_function_linkage: false,
      enable_whole: true,
      metadata: {
        flavor_factor: '1',
        bake_factor: '0',
        can_split: 'true'
      },
      ordinal: 0,
      revelID: false,
      squareID: false
    };

    it('should accept valid modifier option data', async () => {
      const dto = plainToInstance(ModifierOptionDto, validModifierOptionData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept disabled value', async () => {
      const dto = plainToInstance(ModifierOptionDto, {
        ...validModifierOptionData,
        disabled: { start: 100, end: 200 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative price amount', async () => {
      const dto = plainToInstance(ModifierOptionDto, {
        ...validModifierOptionData,
        price: { amount: -50, currency: CURRENCY.USD }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative ordinal', async () => {
      const dto = plainToInstance(ModifierOptionDto, {
        ...validModifierOptionData,
        ordinal: -1
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('PrinterGroupIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(PrinterGroupIdParams, {
        pgId: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('PrinterGroupDto', () => {
    const validPrinterGroupData = {
      name: 'Kitchen Printers',
      externalIDs: [{ key: 'square_id', value: 'sq_123' }],
      isExpo: false,
      singleItemPerTicket: false
    };

    it('should accept valid printer group data', async () => {
      const dto = plainToInstance(PrinterGroupDto, validPrinterGroupData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty externalIDs', async () => {
      const dto = plainToInstance(PrinterGroupDto, {
        ...validPrinterGroupData,
        externalIDs: []
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('DeleteAndReassignPrinterGroupDto', () => {
    it('should accept valid ObjectId', async () => {
      const dto = plainToInstance(DeleteAndReassignPrinterGroupDto, {
        reassign_to: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ObjectId', async () => {
      const dto = plainToInstance(DeleteAndReassignPrinterGroupDto, {
        reassign_to: 'invalid-id'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('FulfillmentIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(FulfillmentIdParams, {
        fid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('FulfillmentDto', () => {
    const validFulfillmentData = {
      displayName: 'Delivery',
      shortcode: 'DEL',
      ordinal: 0,
      exposeFulfillment: true,
      service: FulfillmentType.Delivery
    };

    it('should accept valid fulfillment data', async () => {
      const dto = plainToInstance(FulfillmentDto, validFulfillmentData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept all optional fields', async () => {
      const dto = plainToInstance(FulfillmentDto, {
        ...validFulfillmentData,
        terms: { min_order: 2000 },
        orderMetadata: { show_map: true },
        serviceArea: { radius: 5 },
        menuBasicConfig: {},
        menuAdvancedConfig: {},
        orderBasicConfig: {},
        orderAdvancedConfig: {}
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative ordinal', async () => {
      const dto = plainToInstance(FulfillmentDto, {
        ...validFulfillmentData,
        ordinal: -1
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid service type', async () => {
      const dto = plainToInstance(FulfillmentDto, {
        ...validFulfillmentData,
        service: 'INVALID_SERVICE'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SeatingResourceIdParams', () => {
    it('should accept valid MongoDB ObjectId', async () => {
      const dto = plainToInstance(SeatingResourceIdParams, {
        srid: '507f1f77bcf86cd799439011'
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('SeatingResourceDto', () => {
    const validSeatingResourceData = {
      name: 'Table 1',
      capacity: 4,
      shape: SeatingShape.RECTANGLE,
      center: { x: 100, y: 200 },
      shapeDims: { x: 50, y: 50 },
      rotation: 0
    };

    it('should accept valid seating resource data', async () => {
      const dto = plainToInstance(SeatingResourceDto, validSeatingResourceData);
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept disabled flag', async () => {
      const dto = plainToInstance(SeatingResourceDto, {
        ...validSeatingResourceData,
        disabled: true
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative capacity', async () => {
      const dto = plainToInstance(SeatingResourceDto, {
        ...validSeatingResourceData,
        capacity: -1
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject center coordinates > 1440', async () => {
      const dto = plainToInstance(SeatingResourceDto, {
        ...validSeatingResourceData,
        center: { x: 1500, y: 200 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative center coordinates', async () => {
      const dto = plainToInstance(SeatingResourceDto, {
        ...validSeatingResourceData,
        center: { x: -10, y: 200 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject shapeDims > 720', async () => {
      const dto = plainToInstance(SeatingResourceDto, {
        ...validSeatingResourceData,
        shapeDims: { x: 800, y: 50 }
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative rotation', async () => {
      const dto = plainToInstance(SeatingResourceDto, {
        ...validSeatingResourceData,
        rotation: -5
      });
      
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
