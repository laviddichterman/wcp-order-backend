import { IsNotEmpty, IsMongoId, IsString, ValidateNested, IsOptional, IsInt, Min, Max, IsIn, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { SeatingShape } from '@wcp/wario-shared';

// Param DTOs
export class SeatingResourceIdParams {
  @IsNotEmpty()
  @IsMongoId()
  srid!: string;
}

// Nested DTOs
class CoordinateDto {
  @IsNumber()
  @Min(0)
  @Max(1440)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(1440)
  y!: number;
}

class ShapeDimsDto {
  @IsNumber()
  @Min(0)
  @Max(720)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(720)
  y!: number;
}

// Body DTOs
export class SeatingResourceDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  capacity!: number;

  @IsIn(Object.keys(SeatingShape))
  shape!: string;

  @ValidateNested()
  @Type(() => CoordinateDto)
  center!: CoordinateDto;

  @ValidateNested()
  @Type(() => ShapeDimsDto)
  shapeDims!: ShapeDimsDto;

  @IsNumber()
  @Min(0)
  rotation!: number;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
