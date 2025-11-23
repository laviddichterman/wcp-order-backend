import { IsNotEmpty, IsMongoId, IsISO8601, IsInt, Min, Max, IsEmail, IsArray, ValidateNested, IsBoolean, IsIn, IsString, Length, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CURRENCY, DiscountMethod, PaymentMethod, TenderBaseStatus, WFulfillmentStatus } from '@wcp/wario-shared';
import { IsFulfillmentDefined } from '../validators/CustomValidators';

// Param DTOs
export class OrderIdParams {
  @IsNotEmpty()
  @IsMongoId()
  oId!: string;
}

// Query DTOs
export class QueryOrdersDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

// Body DTOs for Order Creation
class LockDto {
  @IsString()
  enc!: string;

  @IsString()
  iv!: string;

  @IsString()
  auth!: string;
}

class MoneyDto {
  @IsInt()
  @Min(0)
  amount!: number;

  @IsIn(Object.values(CURRENCY))
  currency!: CURRENCY;
}

class DiscountDetailsDto {
  @ValidateNested()
  @Type(() => MoneyDto)
  amount!: MoneyDto;

  @ValidateNested()
  @Type(() => MoneyDto)
  balance!: MoneyDto;

  @IsString()
  @Length(19, 19)
  code!: string;

  @ValidateNested()
  @Type(() => LockDto)
  lock!: LockDto;
}

class ProposedDiscountDto {
  @IsIn([DiscountMethod.CreditCodeAmount])
  t!: DiscountMethod;

  @IsIn([TenderBaseStatus.AUTHORIZED])
  status!: TenderBaseStatus;

  @ValidateNested()
  @Type(() => DiscountDetailsDto)
  discount!: DiscountDetailsDto;
}

class ProposedPaymentDto {
  @IsIn([PaymentMethod.CreditCard, PaymentMethod.StoreCredit])
  t!: PaymentMethod;

  @IsIn([TenderBaseStatus.PROPOSED])
  status!: TenderBaseStatus;
}

class CartEntryDto {
  @IsNotEmpty()
  @IsMongoId()
  categoryId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNotEmpty()
  product!: any; // You might want to create a more specific type
}

class TipDto {
  @IsBoolean()
  isSuggestion!: boolean;

  @IsBoolean()
  isPercentage!: boolean;
}

class CustomerInfoDto {
  @IsString()
  @Length(1)
  givenName!: string;

  @IsString()
  @Length(1)
  familyName!: string;

  @IsString()
  mobileNum!: string;

  @IsEmail()
  email!: string;

  @IsString()
  referral?: string;
}

class FulfillmentDto {
  @IsIn([WFulfillmentStatus.PROPOSED])
  status!: WFulfillmentStatus;

  @IsNotEmpty()
  @IsMongoId()
  @IsFulfillmentDefined()
  selectedService!: string;

  @IsISO8601()
  selectedDate!: string;

  @IsInt()
  @Min(0)
  @Max(1440)
  selectedTime!: number;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => FulfillmentDto)
  fulfillment!: FulfillmentDto;

  @ValidateNested()
  @Type(() => CustomerInfoDto)
  customerInfo!: CustomerInfoDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposedDiscountDto)
  proposedDiscounts!: ProposedDiscountDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposedPaymentDto)
  proposedPayments!: ProposedPaymentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartEntryDto)
  cart!: CartEntryDto[];

  @ValidateNested()
  @Type(() => TipDto)
  tip!: TipDto;

  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

// Cancel Order DTO
export class CancelOrderDto {
  @IsString()
  reason!: string;

  @IsBoolean()
  emailCustomer!: boolean;

  @IsOptional()
  @IsBoolean()
  refundToOriginalPayment?: boolean;
}

// Confirm Order DTO
export class ConfirmOrderDto {
  @IsString()
  additionalMessage!: string;
}

// Move Order DTO
export class MoveOrderDto {
  @IsString()
  destination!: string;

  @IsString()
  additionalMessage!: string;
}

// Reschedule Order DTO
export class RescheduleOrderDto {
  @IsISO8601()
  selectedDate!: string;

  @IsInt()
  @Min(0)
  @Max(1440)
  selectedTime!: number;

  @IsBoolean()
  emailCustomer!: boolean;

  @IsString()
  additionalMessage!: string;
}
