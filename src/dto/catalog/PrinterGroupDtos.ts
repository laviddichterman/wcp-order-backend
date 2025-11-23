import { IsNotEmpty, IsMongoId, IsString, IsArray, ValidateNested, IsBoolean, IsInt, Min, Max, IsIn, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

// Param DTOs
export class PrinterGroupIdParams {
  @IsNotEmpty()
  @IsMongoId()
  pgId!: string;
}

// Nested DTOs
class KeyValueDto {
  @IsString()
  key!: string;

  @IsNotEmpty()
  value!: any;
}

// Body DTOs
export class PrinterGroupDto {
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyValueDto)
  externalIDs!: KeyValueDto[];

  @IsBoolean()
  isExpo!: boolean;

  @IsBoolean()
  singleItemPerTicket!: boolean;
}

export class DeleteAndReassignPrinterGroupDto {
  @IsNotEmpty()
  @IsMongoId()
  reassign_to!: string;
}
