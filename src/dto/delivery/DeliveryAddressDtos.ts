import { IsNotEmpty, IsString, IsMongoId } from 'class-validator';
import { IsFulfillmentDefined } from '../validators/CustomValidators';

// Body DTOs
export class DeliveryAddressValidateDto {
  @IsNotEmpty()
  @IsMongoId()
  @IsFulfillmentDefined()
  fulfillmentId!: string;

  @IsString()
  address!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  zipcode!: string;
}
