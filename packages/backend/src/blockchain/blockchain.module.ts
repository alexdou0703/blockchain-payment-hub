import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EthersService } from './ethers.service';
import { EventListenerService } from './event-listener.service';
import { Payment } from '../payments/entities/payment.entity';
import { Order } from '../orders/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
  ],
  providers: [EthersService, EventListenerService],
  exports: [EthersService],
})
export class BlockchainModule {}
