import {
  Controller,
  Post,
  Get,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { OracleService } from './oracle.service';
import { OracleDeliveryDto } from './dto/oracle-delivery.dto';

@ApiTags('Oracle')
@Controller('api/v1/oracle')
export class OracleController {
  constructor(private readonly oracleService: OracleService) {}

  @Post('delivery')
  @ApiOperation({ summary: 'Receive delivery confirmation webhook from logistics provider' })
  recordDelivery(@Body() dto: OracleDeliveryDto) {
    return this.oracleService.submitConfirmation(
      dto.provider,
      dto.orderId,
      dto.trackingCode,
    );
  }

  @Get('status/:orderId')
  @ApiOperation({ summary: 'Get oracle confirmation count for an order' })
  @ApiParam({ name: 'orderId', description: 'On-chain order ID (bytes32 hex)' })
  getOracleStatus(@Param('orderId') orderId: string) {
    return this.oracleService.getStatus(orderId);
  }

  @Post('mock/deliver/:orderId')
  @ApiOperation({ summary: '[DEV] Mock two provider delivery confirmations' })
  @ApiParam({ name: 'orderId', description: 'On-chain order ID (bytes32 hex)' })
  mockDeliver(@Param('orderId') orderId: string) {
    return this.oracleService.mockDeliver(orderId);
  }
}
