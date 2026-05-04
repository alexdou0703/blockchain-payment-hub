import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { PaymentState, PaymentPayload } from '@payment-hub/shared';

export interface GeneratedPaymentRequest {
  paymentId: string;
  payload: PaymentPayload;
}

/** Generates signed payment request payloads for customer checkout */
@Injectable()
export class PaymentRequestService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly config: ConfigService,
  ) {}

  async generatePaymentRequest(
    dto: CreatePaymentRequestDto,
  ): Promise<GeneratedPaymentRequest> {
    // Deterministic bytes32 orderId from platform string
    const orderIdBytes = ethers.keccak256(ethers.toUtf8Bytes(dto.platformOrderId));

    // Random nonce to prevent replay attacks
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    // Payment window: 30 minutes from now
    const deadline = Math.floor(Date.now() / 1000) + 1800;

    const tokenAddress =
      this.config.get<string>('blockchain.usdtAddress') || ethers.ZeroAddress;

    // Convert amount to uint256-compatible string (assume 6 decimals for USDT)
    const amountBigInt = ethers.parseUnits(dto.amount, 6).toString();

    const paymentRequestId = uuidv4();

    // Persist the payment record
    const payment = this.paymentRepo.create({
      orderId: dto.platformOrderId,
      paymentRequestId,
      merchantAddress: dto.merchantAddress,
      customerAddress: dto.customerAddress,
      tokenAddress,
      amount: dto.amount,
      nonce,
      deadline,
      state: PaymentState.PENDING,
    });
    await this.paymentRepo.save(payment);

    // Backfill onChainOrderId on the Order if it exists (best-effort — id may not be a valid UUID)
    await this.orderRepo.update(
      { id: dto.platformOrderId },
      { onChainOrderId: orderIdBytes },
    ).catch(() => { /* no matching order — fine */ });

    const payload: PaymentPayload = {
      merchant: dto.merchantAddress,
      customer: dto.customerAddress,
      amount: amountBigInt,
      orderId: orderIdBytes,
      nonce,
      deadline,
      token: tokenAddress,
    };

    return { paymentId: payment.id, payload };
  }
}
