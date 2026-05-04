import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MetricsService, MetricsResult } from './metrics.service';

@ApiTags('Metrics')
@Controller('api/v1/metrics')
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) {}

    @Get()
    @ApiOperation({ summary: 'Retrieve dashboard metrics for payments, disputes, settlement, and gas' })
    getMetrics(): Promise<MetricsResult> {
        return this.metricsService.getMetrics();
    }
}
