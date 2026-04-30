import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/entities/payment.entity';
import { SettlementService } from './settlement.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment]), BlockchainModule],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
