import { IsNotEmpty, IsMongoId, IsString, IsArray, ValidateNested, IsBoolean, IsInt, Min, Max, IsIn, IsOptional, ArrayMinSize, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { CURRENCY, DISPLAY_AS, MODIFIER_CLASS } from '@wcp/wario-shared';
import { IsValidDisabledValue } from '../validators/CustomValidators';

// Param DTOs
export class ModifierTypeIdParams {
  @IsNotEmpty()
  @IsMongoId()
  mtid!: string;
}

export class ModifierOptionIdParams {
  @IsNotEmpty()
  @IsMongoId()
  moid!: string;
}

export class ModifierTypeAndOptionIdParams {
  @IsNotEmpty()
  @IsMongoId()
  mtid!: string;

  @IsNotEmpty()
  @IsMongoId()
  moid!: string;
}

// Nested DTOs
class KeyValueDto {
  @IsString()
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

class ModifierMetadataDto {
  @IsString()
  flavor_factor!: string;

  @IsString()
  bake_factor!: string;

  @IsString()
  can_split!: string;
}

// Body DTOs
export class ModifierTypeDto {
  @IsString()
  @Length(1)
  name!: string;

  @IsString()
  displayName!: string;

  @IsInt()
  @Min(0)
  @Max(500)
  ordinal!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  min_selected!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  max_selected!: number;

  @IsBoolean()
  revelID!: boolean;

  @IsBoolean()
  squareID!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyValueDto)
  externalIDs!: KeyValueDto[];

  @IsIn(Object.keys(DISPLAY_AS))
  displayFlags!: string;

  @IsOptional()
  @Min(0)
  omit_options_if_not_available?: number;

  @IsOptional()
  @Min(0)
  omit_section_if_no_available_options?: number;

  @IsBoolean()
  use_toggle_if_only_two_options!: boolean;

  @IsBoolean()
  hidden!: boolean;

  @IsBoolean()
  empty_display_as_message_only!: boolean;

  @IsString()
  modifier_class!: MODIFIER_CLASS;
}

export class ModifierOptionDto {
  @IsString()
  @Length(1)
  displayName!: string;

  @IsString()
  description!: string;

  @IsBoolean()
  shortcode!: boolean;

  @IsOptional()
  @IsString()
  price_display?: string | null;

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

  @IsBoolean()
  enable_function_linkage!: boolean;

  @IsBoolean()
  enable_whole!: boolean;

  @IsOptional()
  @IsString()
  flavor_factor?: string | null;

  @IsOptional()
  @IsString()
  bake_factor?: string | null;

  @IsOptional()
  @IsString()
  can_split?: string | null;

  @ValidateNested()
  @Type(() => ModifierMetadataDto)
  metadata!: ModifierMetadataDto;

  @IsInt()
  @Min(0)
  ordinal!: number;

  @IsBoolean()
  revelID!: boolean;

  @IsBoolean()
  squareID!: boolean;
}
