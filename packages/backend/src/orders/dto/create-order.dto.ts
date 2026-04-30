import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: 'Platform merchant identifier' })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({ description: 'Platform customer identifier' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional({ description: 'Merchant Ethereum address' })
  @IsOptional()
  @IsString()
  merchantAddress?: string;

  @ApiPropertyOptional({ description: 'Customer Ethereum address' })
  @IsOptional()
  @IsString()
  customerAddress?: string;

  @ApiProperty({ description: 'Order amount as decimal string (e.g. "100.000000")' })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiPropertyOptional({ description: 'ERC-20 token address for payment' })
  @IsOptional()
  @IsString()
  tokenAddress?: string;
}
