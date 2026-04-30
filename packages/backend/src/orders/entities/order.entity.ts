import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus } from '@payment-hub/shared';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** bytes32 hex — set after payment request creation */
  @Column({ nullable: true })
  onChainOrderId: string;

  @Column()
  merchantId: string;

  @Column()
  customerId: string;

  @Column({ nullable: true })
  merchantAddress: string;

  @Column({ nullable: true })
  customerAddress: string;

  /** Stored as string to avoid floating-point precision loss */
  @Column({ type: 'decimal', precision: 20, scale: 6 })
  amount: string;

  @Column({ nullable: true })
  tokenAddress: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.CREATED })
  status: OrderStatus;

  /** Transaction hash of the on-chain lockEscrow call */
  @Column({ nullable: true })
  txHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
