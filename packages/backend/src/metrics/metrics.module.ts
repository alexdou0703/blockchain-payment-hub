import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/entities/payment.entity';
import { Dispute } from '../disputes/entities/dispute.entity';
import { SettlementBatch } from '../settlement/entities/settlement-batch.entity';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Payment, Dispute, SettlementBatch])],
    providers: [MetricsService],
    controllers: [MetricsController],
})
export class MetricsModule {}
