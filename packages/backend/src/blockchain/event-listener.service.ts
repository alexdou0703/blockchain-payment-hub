import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { EthersService } from './ethers.service';
import { Payment } from '../payments/entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { PaymentState, OrderStatus, ESCROW_ABI } from '@payment-hub/shared';

/** Subscribes to EscrowManager WebSocket events and syncs local state */
@Injectable()
export class EventListenerService implements OnModuleInit {
  private readonly logger = new Logger(EventListenerService.name);

  constructor(
    private readonly ethersService: EthersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  onModuleInit() {
    const wsUrl = this.config.get<string>('blockchain.sepoliaWs');
    if (!wsUrl) {
      this.logger.warn('SEPOLIA_WS_URL not configured — skipping event listener setup');
      return;
    }
    this.setupListeners();
  }

  private setupListeners() {
    const wsProvider = this.ethersService.getWsProvider();
    if (!wsProvider) return;

    const escrowAddr = this.config.get<string>('blockchain.escrowAddress');
    const contract = new ethers.Contract(escrowAddr, [...ESCROW_ABI], wsProvider);

    contract.on('EscrowLocked', async (orderId: string) => {
      try {
        await this.updatePaymentByOrderId(orderId, PaymentState.LOCKED);
        this.eventEmitter.emit('escrow.locked', { orderId });
        this.logger.log(`EscrowLocked: ${orderId}`);
      } catch (e) {
        this.logger.error(`EscrowLocked handler error: ${e.message}`);
      }
    });

    contract.on('EscrowReleased', async (orderId: string) => {
      try {
        await this.updatePaymentByOrderId(orderId, PaymentState.RELEASED);
        this.eventEmitter.emit('escrow.released', { orderId });
        this.logger.log(`EscrowReleased: ${orderId}`);
      } catch (e) {
        this.logger.error(`EscrowReleased handler error: ${e.message}`);
      }
    });

    contract.on('EscrowAutoReleased', async (orderId: string) => {
      try {
        await this.updatePaymentByOrderId(orderId, PaymentState.AUTO_RELEASED);
        this.logger.log(`EscrowAutoReleased: ${orderId}`);
      } catch (e) {
        this.logger.error(`EscrowAutoReleased handler error: ${e.message}`);
      }
    });

    contract.on('EscrowDisputed', async (orderId: string, initiator: string) => {
      try {
        await this.updatePaymentByOrderId(orderId, PaymentState.DISPUTED);
        this.eventEmitter.emit('escrow.disputed', { orderId, initiator });
        this.logger.log(`EscrowDisputed: ${orderId} by ${initiator}`);
      } catch (e) {
        this.logger.error(`EscrowDisputed handler error: ${e.message}`);
      }
    });

    contract.on('EscrowRefunded', async (orderId: string) => {
      try {
        await this.updatePaymentByOrderId(orderId, PaymentState.REFUNDED);
        this.logger.log(`EscrowRefunded: ${orderId}`);
      } catch (e) {
        this.logger.error(`EscrowRefunded handler error: ${e.message}`);
      }
    });

    contract.on('DeliveryConfirmed', async (orderId: string) => {
      try {
        await this.updateOrderStatus(orderId, OrderStatus.DELIVERED);
        this.eventEmitter.emit('delivery.confirmed', { orderId });
        this.logger.log(`DeliveryConfirmed: ${orderId}`);
      } catch (e) {
        this.logger.error(`DeliveryConfirmed handler error: ${e.message}`);
      }
    });

    this.logger.log('Blockchain event listeners registered');
  }

  /** Find payment by onChainOrderId, update payment state */
  private async updatePaymentByOrderId(onChainOrderId: string, state: PaymentState) {
    // Primary path: via linked Order row
    const order = await this.orderRepo.findOne({ where: { onChainOrderId } }).catch(() => null);
    if (order) {
      await this.paymentRepo.update({ orderId: order.id }, { state });
      return;
    }
    // Fallback: scan PENDING payments and find whose orderId hashes to the on-chain id
    const pending = await this.paymentRepo.find({ where: { state: PaymentState.PENDING } });
    for (const p of pending) {
      if (ethers.keccak256(ethers.toUtf8Bytes(p.orderId)) === onChainOrderId) {
        await this.paymentRepo.update({ id: p.id }, { state });
        this.logger.log(`Synced payment ${p.id} via hash fallback`);
      }
    }
  }

  /** Update order status when delivery is confirmed on-chain */
  private async updateOrderStatus(orderId: string, status: OrderStatus) {
    await this.orderRepo.update({ onChainOrderId: orderId }, { status });
  }
}
