import { IsString, IsNotEmpty, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyProofDto {
  @ApiProperty({ description: 'On-chain batchId (uint256 as string)' })
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @ApiProperty({ description: 'Leaf hash to verify (bytes32 hex)' })
  @IsString()
  @IsNotEmpty()
  txHash: string;

  @ApiProperty({ description: 'Merkle proof siblings (bytes32 hex array)', type: [String] })
  @IsArray()
  proof: string[];
}
