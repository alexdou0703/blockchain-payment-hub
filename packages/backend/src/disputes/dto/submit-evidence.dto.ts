import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitEvidenceDto {
  @ApiProperty({ description: 'IPFS content hash of the evidence file' })
  @IsString()
  @IsNotEmpty()
  ipfsHash: string;
}
