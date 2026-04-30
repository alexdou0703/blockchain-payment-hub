import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** GHTK delivery webhook payload (simplified — full spec at docs.giaohangnhanh.vn) */
export class GhtkWebhookDto {
  @ApiProperty({ description: 'GHTK shipment label ID', example: 'GHTK-98765432' })
  @IsString()
  @IsNotEmpty()
  label_id: string;

  @ApiProperty({
    description: 'GHTK status code — oracle only processes 4 (delivered)',
    example: 4,
  })
  @IsNumber()
  status_id: number;
}
