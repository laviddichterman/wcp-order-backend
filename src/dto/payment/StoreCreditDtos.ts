import { IsNotEmpty, IsInt, Min, Max, IsIn, IsString, Length, ValidateNested, IsBoolean, IsOptional, IsEmail, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import { CURRENCY, StoreCreditType } from '@wcp/wario-shared';

// Query DTOs
export class CreditCodeQuery {
  @IsString()
  @Length(19, 19)
  code!: string;
}

// Nested DTOs
class MoneyDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsIn(Object.values(CURRENCY))
  currency!: CURRENCY;
}

class LockDto {
  @IsString()
  enc!: string;

  @IsString()
  iv!: string;

  @IsString()
  auth!: string;
}

// Body DTOs
export class PurchaseStoreCreditDto {
  @ValidateNested()
  @Type(() => MoneyDto)
  amount!: MoneyDto;

  @IsString()
  senderName!: string;

  @IsEmail()
  senderEmail!: string;

  @IsString()
  recipientNameFirst!: string;

  @IsString()
  recipientNameLast!: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsBoolean()
  sendEmailToRecipient!: boolean;

  @IsOptional()
  @IsString()
  recipientMessage?: string;
}

export class SpendStoreCreditDto {
  @IsString()
  @Length(19, 19)
  code!: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  amount!: MoneyDto;

  @IsNotEmpty()
  updatedBy!: any;

  @ValidateNested()
  @Type(() => LockDto)
  lock!: LockDto;
}

export class IssueStoreCreditDto {
  @ValidateNested()
  @Type(() => MoneyDto)
  amount!: MoneyDto;

  @IsString()
  @Length(1)
  recipientNameFirst!: string;

  @IsString()
  @Length(1)
  recipientNameLast!: string;

  @IsEmail()
  recipientEmail!: string;

  @IsIn(Object.keys(StoreCreditType))
  creditType!: string;

  @IsOptional()
  @IsISO8601()
  expiration?: string;

  @IsString()
  @Length(1)
  addedBy!: string;

  @IsString()
  @Length(1)
  reason!: string;
}
