import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Viettel Post delivery webhook payload */
export class ViettelWebhookDto {
  @ApiProperty({ description: 'Viettel Post bill code (tracking number)', example: 'VTP-ABCDE123' })
  @IsString()
  @IsNotEmpty()
  bill_code: string;

  @ApiProperty({
    description: 'Status string — oracle processes "DELIVERED" or "SUCCESS"',
    example: 'DELIVERED',
  })
  @IsString()
  @IsNotEmpty()
  status: string;
}
