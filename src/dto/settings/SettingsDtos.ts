import { IsNotEmpty, IsInt, Min, Max, IsIn, IsISO8601, IsArray, IsObject, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { IsFulfillmentDefined, AreKeysValidFulfillments } from '../validators/CustomValidators';

// Nested DTOs
class IntervalDto {
  @IsInt()
  @Min(0)
  @Max(1440)
  start!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  end!: number;
}

// Body DTOs
export class BlockOffDto {
  @IsArray()
  @ArrayMinSize(1)
  fulfillmentIds!: string[];

  @IsISO8601()
  date!: string;

  @ValidateNested()
  @Type(() => IntervalDto)
  interval!: IntervalDto;
}

export class LeadTimeDto {
  @IsObject()
  @AreKeysValidFulfillments()
  leadTimes!: Record<string, number>;
}

export class SettingsDto {
  @IsInt()
  @Min(0)
  additional_pizza_lead_time!: number;
}
