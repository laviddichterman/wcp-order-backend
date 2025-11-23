import { IsNotEmpty, IsMongoId, IsString, IsArray, ValidateNested, IsBoolean, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CALL_LINE_DISPLAY, CategoryDisplay } from '@wcp/wario-shared';
import { IsFulfillmentDefined } from '../validators/CustomValidators';

// Param DTOs
export class CategoryIdParams {
  @IsNotEmpty()
  @IsMongoId()
  catid!: string;
}

// Nested DTOs
class DisplayFlagsDto {
  @IsString()
  call_line_name!: string;

  @IsIn(Object.keys(CALL_LINE_DISPLAY))
  call_line_display!: string;

  @IsIn(Object.keys(CategoryDisplay))
  nesting!: string;
}

// Body DTOs
export class CategoryDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  subheading!: string;

  @IsString()
  footnotes!: string;

  @IsInt()
  @Min(0)
  ordinal!: number;

  @IsOptional()
  @IsMongoId()
  parent_id?: string | null;

  @ValidateNested()
  @Type(() => DisplayFlagsDto)
  display_flags!: DisplayFlagsDto;

  @IsOptional()
  serviceDisable?: Record<string, any>;
}

export class DeleteCategoryDto {
  @IsOptional()
  @IsBoolean()
  delete_contained_products?: boolean;
}
