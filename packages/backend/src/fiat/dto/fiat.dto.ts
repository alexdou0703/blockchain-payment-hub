import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OnrampDto {
  @ApiProperty({ description: 'Customer platform user ID' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ description: 'VND amount to convert to USDT', example: 250000 })
  @IsNumber()
  @IsPositive()
  vndAmount: number;
}

export class OfframpDto {
  @ApiProperty({ description: 'Merchant platform user ID' })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({ description: 'USDT amount to convert to VND', example: 10.5 })
  @IsNumber()
  @IsPositive()
  usdtAmount: number;

  @ApiProperty({ description: 'Bank account number for VND disbursement' })
  @IsString()
  @IsNotEmpty()
  bankAccount: string;
}
