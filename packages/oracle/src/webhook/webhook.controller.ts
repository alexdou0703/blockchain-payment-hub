import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { OracleService } from '../oracle/oracle.service';
import { OrderMappingService } from '../oracle/order-mapping.service';
import { GhnWebhookDto } from './dto/ghn-webhook.dto';
import { GhtkWebhookDto } from './dto/ghtk-webhook.dto';
import { ViettelWebhookDto } from './dto/viettel-webhook.dto';

class RegisterMappingDto {
  trackingCode: string;
  orderId: string;
}

@ApiTags('Webhook')
@Controller()
export class WebhookController {
  constructor(
    private readonly oracle: OracleService,
    private readonly mapping: OrderMappingService,
  ) {}

  // ------------------------------------------------------------------
  // Logistics provider webhooks
  // ------------------------------------------------------------------

  @Post('webhook/ghn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GHN delivery confirmation webhook' })
  async handleGhn(@Body() payload: GhnWebhookDto) {
    if (payload.Status !== 'delivered') return { ignored: true, reason: 'non-delivery status' };
    return this.oracle.submitConfirmation('GHN', payload.order_code);
  }

  @Post('webhook/ghtk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GHTK delivery confirmation webhook' })
  async handleGhtk(@Body() payload: GhtkWebhookDto) {
    // GHTK status 4 = delivered
    if (payload.status_id !== 4) return { ignored: true, reason: 'non-delivery status' };
    return this.oracle.submitConfirmation('GHTK', payload.label_id);
  }

  @Post('webhook/viettel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Viettel Post delivery confirmation webhook' })
  async handleViettel(@Body() payload: ViettelWebhookDto) {
    const deliveredStatuses = ['DELIVERED', 'SUCCESS'];
    if (!deliveredStatuses.includes(payload.status.toUpperCase())) {
      return { ignored: true, reason: 'non-delivery status' };
    }
    return this.oracle.submitConfirmation('VIETTEL', payload.bill_code);
  }

  // ------------------------------------------------------------------
  // Order ID mapping registration (called by backend when order ships)
  // ------------------------------------------------------------------

  @Post('mapping/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register tracking code → on-chain orderId mapping' })
  registerMapping(@Body() dto: RegisterMappingDto) {
    this.mapping.register(dto.trackingCode, dto.orderId);
    return { ok: true };
  }

  @Get('mapping')
  @ApiOperation({ summary: 'List all registered tracking code mappings' })
  listMappings() {
    return this.mapping.listAll();
  }

  // ------------------------------------------------------------------
  // Oracle status query
  // ------------------------------------------------------------------

  @Get('oracle/status/:orderId')
  @ApiOperation({ summary: 'Get on-chain confirmation count and delivery status' })
  @ApiParam({ name: 'orderId', description: 'bytes32 orderId or plain string (will be keccak256 hashed)' })
  getStatus(@Param('orderId') orderId: string) {
    return this.oracle.getStatus(orderId);
  }

  // ------------------------------------------------------------------
  // Dev mock endpoint
  // ------------------------------------------------------------------

  @Post('webhook/mock/deliver/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[DEV] Simulate 2-of-3 provider delivery confirmations' })
  @ApiParam({ name: 'orderId', description: 'bytes32 orderId or plain string' })
  mockDeliver(@Param('orderId') orderId: string) {
    return this.oracle.mockDeliver(orderId);
  }
}
