import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { SubmitEvidenceDto } from './dto/submit-evidence.dto';
import { DisputeState } from '@payment-hub/shared';

@ApiTags('Disputes')
@Controller('api/v1/disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new dispute for an order' })
  openDispute(@Body() dto: CreateDisputeDto) {
    return this.disputesService.createDisputeRecord(dto.orderId, dto.initiatorAddress);
  }

  @Post(':id/evidence')
  @ApiOperation({ summary: 'Submit evidence IPFS hash for a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  submitEvidence(@Param('id') id: string, @Body() dto: SubmitEvidenceDto) {
    return this.disputesService.addEvidence(id, dto.ipfsHash);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dispute by ID' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  getDispute(@Param('id') id: string) {
    return this.disputesService.findById(id);
  }

  @Post(':id/appeal')
  @ApiOperation({ summary: 'Appeal a resolved dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  async appealDispute(@Param('id') id: string) {
    const dispute = await this.disputesService.findById(id);
    await this.disputesService.updateState(dispute.orderId, DisputeState.APPEALED);
    return this.disputesService.findById(id);
  }
}
