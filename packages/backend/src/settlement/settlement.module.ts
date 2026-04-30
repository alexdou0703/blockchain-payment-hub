import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Payment } from '../payments/entities/payment.entity';
import { SettlementBatch } from './entities/settlement-batch.entity';
import { SettlementService } from './settlement.service';
import { SettlementController } from './settlement.controller';
import { PinataService } from './pinata.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Payment, SettlementBatch]),
    BlockchainModule,
  ],
  providers: [SettlementService, PinataService],
  controllers: [SettlementController],
  exports: [SettlementService],
})
export class SettlementModule {}
