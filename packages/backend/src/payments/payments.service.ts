import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentState } from '@payment-hub/shared';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async findById(id: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    return payment;
  }

  async findByOrderId(orderId: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { orderId } });
    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }
    return payment;
  }

  /**
   * Update payment state — called by EventListenerService after on-chain events.
   * Also sets timestamp fields (lockedAt, releasedAt) when appropriate.
   */
  async updateState(paymentId: string, state: PaymentState): Promise<void> {
    const updates: Partial<Payment> = { state };
    const now = new Date();

    if (state === PaymentState.LOCKED) updates.lockedAt = now;
    if (state === PaymentState.RELEASED || state === PaymentState.AUTO_RELEASED) {
      updates.releasedAt = now;
    }

    await this.paymentRepo.update({ id: paymentId }, updates);
  }

  /** Store merchant EIP-712 signature for the payment payload */
  async confirmSignature(id: string, merchantSignature: string): Promise<Payment> {
    await this.findById(id); // ensure it exists
    await this.paymentRepo.update({ id }, { merchantSignature });
    return this.findById(id);
  }
}
