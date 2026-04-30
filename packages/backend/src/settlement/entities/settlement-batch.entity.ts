import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('settlement_batches')
export class SettlementBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** uint256 batchId emitted by SettlementContract.BatchCommitted event */
  @Column({ nullable: true })
  onChainBatchId: string;

  @Column()
  merkleRoot: string;

  @Column()
  txCount: number;

  /** IPFS CID of the batch metadata JSON */
  @Column({ nullable: true })
  ipfsHash: string;

  /** On-chain commitBatch tx hash */
  @Column({ nullable: true })
  commitTxHash: string;

  @CreateDateColumn()
  committedAt: Date;
}
