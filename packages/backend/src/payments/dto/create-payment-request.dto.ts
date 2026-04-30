import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentRequestDto {
  @ApiProperty({ description: 'Platform order ID (will be keccak256-hashed for on-chain orderId)' })
  @IsString()
  @IsNotEmpty()
  platformOrderId: string;

  @ApiProperty({ description: 'Merchant Ethereum address' })
  @IsString()
  @IsNotEmpty()
  merchantAddress: string;

  @ApiProperty({ description: 'Customer Ethereum address' })
  @IsString()
  @IsNotEmpty()
  customerAddress: string;

  @ApiProperty({ description: 'Payment amount as decimal string (e.g. "50.000000")' })
  @IsString()
  @IsNotEmpty()
  amount: string;
}
