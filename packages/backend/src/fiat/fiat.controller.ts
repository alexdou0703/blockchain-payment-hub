import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FiatBridgeService } from './fiat-bridge.service';
import { OnrampDto, OfframpDto } from './dto/fiat.dto';

@ApiTags('Fiat Bridge')
@Controller('api/v1/fiat')
export class FiatController {
  constructor(private readonly fiat: FiatBridgeService) {}

  @Get('rate')
  @ApiOperation({ summary: 'Get live USDT/VND exchange rate' })
  async getRate() {
    const rate = await this.fiat.getRate();
    return { usdtVnd: rate, source: 'coingecko' };
  }

  @Post('on-ramp')
  @ApiOperation({ summary: 'Mock: customer deposits VND and receives USDT' })
  onramp(@Body() dto: OnrampDto) {
    return this.fiat.onramp(dto.customerId, dto.vndAmount);
  }

  @Post('off-ramp')
  @ApiOperation({ summary: 'Mock: merchant withdraws USDT and receives VND to bank' })
  offramp(@Body() dto: OfframpDto) {
    return this.fiat.offramp(dto.merchantId, dto.usdtAmount, dto.bankAccount);
  }
}
