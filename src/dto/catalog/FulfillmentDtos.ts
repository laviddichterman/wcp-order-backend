import { IsNotEmpty, IsMongoId, IsString, IsBoolean, IsInt, Min, IsIn, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FulfillmentType } from '@wcp/wario-shared';

// Param DTOs
export class FulfillmentIdParams {
  @IsNotEmpty()
  @IsMongoId()
  fid!: string;
}

// Body DTOs
export class FulfillmentDto {
  @IsString()
  displayName!: string;

  @IsString()
  shortcode!: string;

  @IsInt()
  @Min(0)
  ordinal!: number;

  @IsBoolean()
  exposeFulfillment!: boolean;

  @IsIn(Object.values(FulfillmentType))
  service!: FulfillmentType;

  @IsOptional()
  @IsObject()
  terms?: any;

  @IsOptional()
  @IsObject()
  orderMetadata?: any;

  @IsOptional()
  @IsObject()
  serviceArea?: any;

  @IsOptional()
  @IsObject()
  menuBasicConfig?: any;

  @IsOptional()
  @IsObject()
  menuAdvancedConfig?: any;

  @IsOptional()
  @IsObject()
  orderBasicConfig?: any;

  @IsOptional()
  @IsObject()
  orderAdvancedConfig?: any;
}
