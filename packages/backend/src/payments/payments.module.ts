import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { PaymentsService } from './payments.service';
import { PaymentRequestService } from './payment-request.service';
import { PaymentsController } from './payments.controller';
import { PaymentStateProcessor } from './processors/payment-state.processor';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    BullModule.registerQueue({ name: 'payment-state' }),
    BlockchainModule,
  ],
  providers: [PaymentsService, PaymentRequestService, PaymentStateProcessor],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
