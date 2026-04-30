import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { OracleService } from './oracle.service';
import { OrderMappingService } from './order-mapping.service';

@Module({
  imports: [BlockchainModule],
  providers: [OracleService, OrderMappingService],
  exports: [OracleService, OrderMappingService],
})
export class OracleModule {}
