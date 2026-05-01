import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { EthersService } from '../blockchain/ethers.service';
import { PaymentState } from '@payment-hub/shared';

const PAYMENT_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes(
    'PaymentPayload(address merchant,address customer,uint256 amount,bytes32 orderId,bytes32 nonce,uint256 deadline,address token)',
  ),
);

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly ethersService: EthersService,
  ) {}

  async findById(id: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  /** Returns the full response shape the checkout frontend expects */
  async findByOrderId(orderId: string) {
    const payment = await this.paymentRepo.findOne({ where: { orderId } });
    if (!payment) throw new NotFoundException(`Payment for order ${orderId} not found`);

    const order = await this.orderRepo.findOne({ where: { id: orderId } });

    // Auto-sign if merchant signature not yet stored
    if (!payment.merchantSignature) {
      const sig = await this._signPayload(payment);
      await this.paymentRepo.update({ id: payment.id }, { merchantSignature: sig });
      payment.merchantSignature = sig;
    }

    const onChainOrderId = payment.nonce
      ? ethers.keccak256(ethers.toUtf8Bytes(orderId))
      : '0x0000000000000000000000000000000000000000000000000000000000000000';

    return {
      paymentId: payment.id,
      payload: {
        merchant:  payment.merchantAddress,
        customer:  payment.customerAddress,
        amount:    ethers.parseUnits(payment.amount.toString(), 6).toString(),
        orderId:   onChainOrderId,
        nonce:     payment.nonce,
        deadline:  Number(payment.deadline),
        token:     payment.tokenAddress,
      },
      merchantSignature: payment.merchantSignature,
      order: {
        id:         order?.id ?? orderId,
        merchantId: order?.merchantId ?? '',
        amount:     payment.amount.toString(),
        status:     order?.status ?? 'CREATED',
      },
    };
  }

  async updateState(paymentId: string, state: PaymentState): Promise<void> {
    const updates: Partial<Payment> = { state };
    const now = new Date();
    if (state === PaymentState.LOCKED) updates.lockedAt = now;
    if (state === PaymentState.RELEASED || state === PaymentState.AUTO_RELEASED) {
      updates.releasedAt = now;
    }
    await this.paymentRepo.update({ id: paymentId }, updates);
  }

  async confirmSignature(id: string, merchantSignature: string): Promise<Payment> {
    await this.findById(id);
    await this.paymentRepo.update({ id }, { merchantSignature });
    return this.findById(id);
  }

  /** EIP-712 sign the payment payload using the deployer key (acts as merchant on testnet) */
  private async _signPayload(payment: Payment): Promise<string> {
    const signer = this.ethersService.getSigner();
    const network = await signer.provider!.getNetwork();
    const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS ?? '';

    const domain = {
      name:              'BlockchainPaymentHub',
      version:           '1',
      chainId:           Number(network.chainId),
      verifyingContract: escrowAddress,
    };

    const types = {
      PaymentPayload: [
        { name: 'merchant',  type: 'address' },
        { name: 'customer',  type: 'address' },
        { name: 'amount',    type: 'uint256' },
        { name: 'orderId',   type: 'bytes32' },
        { name: 'nonce',     type: 'bytes32' },
        { name: 'deadline',  type: 'uint256' },
        { name: 'token',     type: 'address' },
      ],
    };

    const value = {
      merchant:  payment.merchantAddress,
      customer:  payment.customerAddress,
      amount:    ethers.parseUnits(payment.amount.toString(), 6),
      orderId:   ethers.keccak256(ethers.toUtf8Bytes(payment.orderId)),
      nonce:     payment.nonce,
      deadline:  Number(payment.deadline),
      token:     payment.tokenAddress,
    };

    return signer.signTypedData(domain, types, value);
  }
}
