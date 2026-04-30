import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsGateway } from './notifications.gateway';

/** Listens to internal domain events and broadcasts them over WebSocket */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly gateway: NotificationsGateway) {}

  @OnEvent('escrow.locked')
  notifyPaymentLocked(payload: { orderId: string }) {
    this.logger.log(`Notify: payment locked for order ${payload.orderId}`);
    this.gateway.emit(payload.orderId, 'payment.locked', payload);
  }

  @OnEvent('escrow.disputed')
  notifyDisputeOpened(payload: { orderId: string }) {
    this.logger.log(`Notify: dispute opened for order ${payload.orderId}`);
    this.gateway.emit(payload.orderId, 'dispute.opened', payload);
  }

  @OnEvent('escrow.released')
  notifyEscrowReleased(payload: { orderId: string }) {
    this.logger.log(`Notify: escrow released for order ${payload.orderId}`);
    this.gateway.emit(payload.orderId, 'escrow.released', payload);
  }

  @OnEvent('delivery.confirmed')
  notifyDeliveryConfirmed(payload: { orderId: string }) {
    this.logger.log(`Notify: delivery confirmed for order ${payload.orderId}`);
    this.gateway.emit(payload.orderId, 'delivery.confirmed', payload);
  }
}
