import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SettlementService } from './settlement.service';
import { VerifyProofDto } from './dto/verify-proof.dto';

@ApiTags('Settlement')
@Controller('api/v1/settlement')
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Get('batches')
  @ApiOperation({ summary: 'List recent settlement batches' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getBatches(@Query('limit') limit?: number) {
    return this.settlement.getRecentBatches(limit ? Number(limit) : 20);
  }

  @Post('trigger')
  @ApiOperation({ summary: '[DEV] Manually trigger a batch settlement run' })
  async triggerBatch() {
    return this.settlement.runBatchSettlement();
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify a Merkle inclusion proof against an on-chain batch' })
  async verifyProof(@Body() dto: VerifyProofDto) {
    const valid = await this.settlement.verifyProofOnChain(dto.batchId, dto.txHash, dto.proof);
    return { valid, batchId: dto.batchId, txHash: dto.txHash };
  }
}
