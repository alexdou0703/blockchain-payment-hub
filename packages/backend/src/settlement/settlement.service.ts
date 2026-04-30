import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { EthersService } from '../blockchain/ethers.service';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentState } from '@payment-hub/shared';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly ethersService: EthersService,
  ) {}

  /** Query all RELEASED payments not yet included in a settlement batch */
  async getUnbatchedReleasedPayments(): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { state: PaymentState.RELEASED, settledInBatch: false },
    });
  }

  /**
   * Build a simple iterative keccak256 root over the provided hashes.
   * Not a full binary Merkle tree — sufficient for batch commitment proofs.
   */
  buildSimpleMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return ethers.ZeroHash;
    let root = hashes[0];
    for (let i = 1; i < hashes.length; i++) {
      root = ethers.keccak256(ethers.concat([root, hashes[i]]));
    }
    return root;
  }

  /**
   * Execute a full batch settlement cycle:
   * 1. Fetch unsettled released payments
   * 2. Build merkle root from tx hashes
   * 3. Commit to BatchSettlement contract
   * 4. Mark payments as settled
   */
  async runBatchSettlement(): Promise<{ settled: number; merkleRoot: string }> {
    const payments = await this.getUnbatchedReleasedPayments();

    if (payments.length === 0) {
      this.logger.log('runBatchSettlement: no unsettled payments');
      return { settled: 0, merkleRoot: ethers.ZeroHash };
    }

    const hashes = payments
      .filter((p) => !!p.chainTxHash)
      .map((p) => p.chainTxHash as string);

    const merkleRoot = this.buildSimpleMerkleRoot(
      hashes.length > 0 ? hashes : [ethers.ZeroHash],
    );

    this.logger.log(
      `Committing batch: ${payments.length} payments, root=${merkleRoot}`,
    );

    const contract = this.ethersService.getSettlementContract();
    await this.ethersService.sendTransaction(contract, 'commitBatch', [
      merkleRoot,
      payments.length,
      'ipfs://mock',
    ]);

    const now = new Date();
    for (const p of payments) {
      await this.paymentRepo.update(
        { id: p.id },
        { settledInBatch: true, settledAt: now },
      );
    }

    this.logger.log(`Batch settled: ${payments.length} payments`);
    return { settled: payments.length, merkleRoot };
  }
}
