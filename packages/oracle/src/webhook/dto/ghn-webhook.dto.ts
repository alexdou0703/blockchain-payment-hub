import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** GHN delivery webhook payload (simplified — full spec at developers.ghn.vn) */
export class GhnWebhookDto {
  @ApiProperty({ description: 'GHN order code (tracking number)', example: 'GHN-12345678' })
  @IsString()
  @IsNotEmpty()
  order_code: string;

  @ApiProperty({
    description: 'Delivery status — oracle only processes "delivered"',
    example: 'delivered',
  })
  @IsString()
  @IsNotEmpty()
  Status: string;
}
