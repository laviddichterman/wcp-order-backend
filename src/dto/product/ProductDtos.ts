import { IsNotEmpty, IsMongoId, IsInt, Min, IsArray, ValidateNested, IsBoolean, IsIn, IsString, Length, IsOptional, IsNumber, IsObject, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CURRENCY, OptionPlacement, OptionQualifier, PriceDisplay } from '@wcp/wario-shared';
import { IsValidDisabledValue, IsFulfillmentDefined } from '../validators/CustomValidators';

// Param DTOs
export class ProductIdParams {
  @IsNotEmpty()
  @IsMongoId()
  pid!: string;
}

export class ProductInstanceIdParams {
  @IsNotEmpty()
  @IsMongoId()
  piid!: string;
}

export class ProductAndInstanceIdParams {
  @IsNotEmpty()
  @IsMongoId()
  pid!: string;

  @IsNotEmpty()
  @IsMongoId()
  piid!: string;
}

// Nested DTOs
class KeyValueDto {
  @IsString()
  @Length(1)
  key!: string;

  @IsNotEmpty()
  value!: any;
}

class MoneyDto {
  @IsInt()
  @Min(0)
  amount!: number;

  @IsIn(Object.values(CURRENCY))
  currency!: CURRENCY;
}

class ModifierOptionDto {
  @IsNotEmpty()
  @IsMongoId()
  optionId!: string;

  @IsIn(Object.values(OptionPlacement))
  placement!: OptionPlacement;

  @IsIn(Object.values(OptionQualifier))
  qualifier!: OptionQualifier;
}

class ProductInstanceModifierDto {
  @IsNotEmpty()
  @IsMongoId()
  modifierTypeId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierOptionDto)
  options!: ModifierOptionDto[];
}

class DisplayFlagsPosDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsBoolean()
  hide!: boolean;

  @IsBoolean()
  skip_customization!: boolean;
}

class DisplayFlagsMenuDto {
  @IsInt()
  @Min(0)
  ordinal!: number;

  @IsBoolean()
  hide!: boolean;

  @IsIn(Object.keys(PriceDisplay))
  price_display!: string;

  @IsString()
  adornment!: string;

  @IsBoolean()
  suppress_exhaustive_modifier_list!: boolean;

  @IsBoolean()
  show_modifier_options!: boolean;
}

class DisplayFlagsOrderDto {
  @IsInt()
  @Min(0)
  ordinal!: number;

  @IsBoolean()
  hide!: boolean;

  @IsBoolean()
  skip_customization!: boolean;

  @IsIn(Object.keys(PriceDisplay))
  price_display!: string;

  @IsString()
  adornment!: string;

  @IsBoolean()
  suppress_exhaustive_modifier_list!: boolean;
}

class ProductInstanceDisplayFlagsDto {
  @ValidateNested()
  @Type(() => DisplayFlagsPosDto)
  pos!: DisplayFlagsPosDto;

  @ValidateNested()
  @Type(() => DisplayFlagsMenuDto)
  menu!: DisplayFlagsMenuDto;

  @ValidateNested()
  @Type(() => DisplayFlagsOrderDto)
  order!: DisplayFlagsOrderDto;
}

// Product Instance DTO
export class ProductInstanceDto {
  @IsString()
  displayName!: string;

  @IsString()
  description!: string;

  @IsString()
  @Length(1)
  shortcode!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyValueDto)
  externalIDs!: KeyValueDto[];

  @ValidateNested()
  @Type(() => ProductInstanceDisplayFlagsDto)
  displayFlags!: ProductInstanceDisplayFlagsDto;

  @IsInt()
  @Min(0)
  ordinal!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductInstanceModifierDto)
  modifiers!: ProductInstanceModifierDto[];
}

// Product Class DTOs
class ProductModifierDto {
  @IsNotEmpty()
  @IsMongoId()
  mtid!: string;

  @IsOptional()
  @IsMongoId()
  enable?: string | null;

  @IsOptional()
  serviceDisable?: Record<string, any>;
}

class OrderGuideDto {
  @IsArray()
  warnings!: string[];

  @IsArray()
  suggestions!: string[];
}

class ProductDisplayFlagsDto {
  @IsNumber()
  @Min(0)
  flavor_max!: number;

  @IsNumber()
  @Min(0)
  bake_max!: number;

  @IsNumber()
  @Min(0)
  bake_differential!: number;

  @IsBoolean()
  show_name_of_base_product!: boolean;

  @IsString()
  singular_noun!: string;

  @IsBoolean()
  is3p!: boolean;

  @ValidateNested()
  @Type(() => OrderGuideDto)
  order_guide!: OrderGuideDto;
}

export class ProductClassDto {
  @ValidateNested()
  @Type(() => MoneyDto)
  price!: MoneyDto;

  @IsValidDisabledValue()
  disabled!: any;

  @IsOptional()
  serviceDisable?: Record<string, any>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyValueDto)
  externalIDs!: KeyValueDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductModifierDto)
  modifiers!: ProductModifierDto[];

  @IsArray()
  category_ids!: string[];

  @ValidateNested()
  @Type(() => ProductDisplayFlagsDto)
  displayFlags!: ProductDisplayFlagsDto;

  @IsOptional()
  @IsMongoId()
  printerGroup?: string | null;

  @IsOptional()
  @IsArray()
  availability?: any[] | null;

  @IsOptional()
  @IsObject()
  timing?: any | null;
}

// Create Product DTO (product + instances)
export class CreateProductDto {
  @ValidateNested()
  @Type(() => ProductClassDto)
  product!: ProductClassDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductInstanceDto)
  instances!: ProductInstanceDto[];
}

// Batch Create Products DTO
export class BatchCreateProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  products!: CreateProductDto[];
}

// Batch Delete Products DTO
export class BatchDeleteProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  pids!: string[];
}
