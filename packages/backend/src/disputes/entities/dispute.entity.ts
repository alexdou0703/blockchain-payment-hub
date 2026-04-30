import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DisputeState } from '@payment-hub/shared';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** References orders.id */
  @Column()
  orderId: string;

  /** Ethereum address of the party that opened the dispute */
  @Column()
  initiatorAddress: string;

  @Column({ type: 'enum', enum: DisputeState, default: DisputeState.OPEN })
  state: DisputeState;

  /** IPFS content hashes for submitted evidence */
  @Column({ type: 'json', default: [] })
  evidenceHashes: string[];

  /** Ruling outcome — RELEASE | REFUND | PARTIAL */
  @Column({ nullable: true })
  ruling: string;

  /** Seller's share in basis points (0-10000) for partial rulings */
  @Column({ type: 'int', nullable: true })
  sellerBasisPoints: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
