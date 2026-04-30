import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { PaymentState } from '@payment-hub/shared';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** References orders.id */
  @Column()
  orderId: string;

  /** Human-readable request identifier */
  @Column()
  paymentRequestId: string;

  @Column()
  merchantAddress: string;

  @Column()
  customerAddress: string;

  @Column()
  tokenAddress: string;

  /** Amount as decimal string to preserve precision */
  @Column({ type: 'decimal', precision: 20, scale: 6 })
  amount: string;

  /** bytes32 hex nonce — uniquely identifies this payment request */
  @Column()
  nonce: string;

  /** Unix timestamp after which the payment request expires */
  @Column({ type: 'bigint' })
  deadline: number;

  /** Merchant EIP-712 signature over the payment payload */
  @Column({ nullable: true })
  merchantSignature: string;

  @Column({ type: 'enum', enum: PaymentState, default: PaymentState.PENDING })
  state: PaymentState;

  /** On-chain transaction hash once submitted */
  @Column({ nullable: true })
  chainTxHash: string;

  /** Whether this payment has been included in a settlement batch */
  @Column({ default: false })
  settledInBatch: boolean;

  @Column({ nullable: true })
  lockedAt: Date;

  @Column({ nullable: true })
  releasedAt: Date;

  @Column({ nullable: true })
  settledAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
