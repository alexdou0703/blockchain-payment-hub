import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { EthersService } from '../../blockchain/ethers.service';
import { Payment } from '../entities/payment.entity';
import { PaymentState } from '@payment-hub/shared';

/** Bull processor handling async payment state transitions */
@Processor('payment-state')
export class PaymentStateProcessor {
  private readonly logger = new Logger(PaymentStateProcessor.name);

  constructor(
    private readonly ethersService: EthersService,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  /**
   * Trigger auto-release for a specific escrow after the lock period expires.
   * Job data: { orderId: string }  — bytes32 hex
   */
  @Process('trigger-auto-release')
  async handleAutoRelease(job: Job<{ orderId: string }>) {
    const { orderId } = job.data;
    this.logger.log(`trigger-auto-release for orderId: ${orderId}`);
    try {
      const contract = this.ethersService.getEscrowContract();
      await this.ethersService.sendTransaction(contract, 'triggerAutoRelease', [orderId]);
      this.logger.log(`Auto-release triggered on-chain for ${orderId}`);
    } catch (e) {
      this.logger.error(`Auto-release failed for ${orderId}: ${e.message}`);
      throw e; // let Bull retry
    }
  }

  /**
   * Settle a batch of released payments into BatchSettlement contract.
   * Job data: {} — no payload needed, queries DB for unsettled payments.
   */
  @Process('settle-batch')
  async handleSettleBatch(job: Job) {
    this.logger.log(`settle-batch job starting`);
    try {
      // Collect all released, unsettled payments
      const payments = await this.paymentRepo.find({
        where: { state: PaymentState.RELEASED, settledInBatch: false },
      });

      if (payments.length === 0) {
        this.logger.log('No unsettled payments — skipping batch');
        return;
      }

      // Build a simple merkle root: iterative keccak256 over tx hashes
      const hashes = payments
        .filter((p) => p.chainTxHash)
        .map((p) => p.chainTxHash as string);

      const merkleRoot = this.buildSimpleMerkleRoot(hashes);

      // Commit the batch on-chain
      const contract = this.ethersService.getSettlementContract();
      await this.ethersService.sendTransaction(contract, 'commitBatch', [
        merkleRoot,
        payments.length,
        'ipfs://mock',
      ]);

      // Mark all as settled
      const now = new Date();
      for (const p of payments) {
        await this.paymentRepo.update({ id: p.id }, { settledInBatch: true, settledAt: now });
      }

      this.logger.log(`Batch settled: ${payments.length} payments, root=${merkleRoot}`);
    } catch (e) {
      this.logger.error(`settle-batch failed: ${e.message}`);
      throw e;
    }
  }

  /** Simple iterative keccak256 root: hash(hash[0] ++ hash[1] ++ ...) */
  private buildSimpleMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return ethers.ZeroHash;
    let root = hashes[0];
    for (let i = 1; i < hashes.length; i++) {
      root = ethers.keccak256(ethers.concat([root, hashes[i]]));
    }
    return root;
  }
}
