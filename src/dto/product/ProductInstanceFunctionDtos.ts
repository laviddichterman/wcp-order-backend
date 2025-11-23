import { IsNotEmpty, IsMongoId, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Param DTOs
export class ProductInstanceFunctionIdParams {
  @IsNotEmpty()
  @IsMongoId()
  fxnid!: string;
}

// Body DTOs
export class ProductInstanceFunctionDto {
  @IsString()
  name!: string;

  @IsNotEmpty()
  expression!: any; // This would typically be IAbstractExpression type
}
