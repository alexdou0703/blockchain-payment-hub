import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OracleDeliveryDto {
  @ApiProperty({ description: 'Logistics provider identifier (Ethereum address or name)' })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty({ description: 'On-chain order ID (bytes32 hex or platform order ID)' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ description: 'Carrier tracking code' })
  @IsString()
  @IsNotEmpty()
  trackingCode: string;
}
