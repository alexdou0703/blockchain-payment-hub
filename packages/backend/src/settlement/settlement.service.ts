import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { EthersService } from '../blockchain/ethers.service';
import { Payment } from '../payments/entities/payment.entity';
import { SettlementBatch } from './entities/settlement-batch.entity';
import { PinataService } from './pinata.service';
import { PaymentState } from '@payment-hub/shared';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(SettlementBatch)
    private readonly batchRepo: Repository<SettlementBatch>,
    private readonly ethersService: EthersService,
    private readonly pinata: PinataService,
  ) {}

  // ------------------------------------------------------------------
  // Cron: every 10 minutes
  // ------------------------------------------------------------------

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledSettlement() {
    try {
      const result = await this.runBatchSettlement();
      if (result.settled > 0) {
        this.logger.log(`Scheduled settlement: ${result.settled} payments, root=${result.merkleRoot}`);
      }
    } catch (err: unknown) {
      this.logger.error(`Scheduled settlement failed: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------
  // Core settlement logic
  // ------------------------------------------------------------------

  async runBatchSettlement(): Promise<{ settled: number; merkleRoot: string; ipfsHash: string }> {
    const payments = await this.getUnbatchedReleasedPayments();
    if (payments.length === 0) {
      return { settled: 0, merkleRoot: ethers.ZeroHash, ipfsHash: '' };
    }

    // Build Merkle leaves: keccak256(chainTxHash ++ merchantAddress ++ amountWei)
    const leaves = payments
      .filter((p) => !!p.chainTxHash)
      .map((p) => this.buildLeaf(p));

    if (leaves.length === 0) {
      this.logger.warn('All unbatched payments are missing chainTxHash — skipping');
      return { settled: 0, merkleRoot: ethers.ZeroHash, ipfsHash: '' };
    }

    const { root, layers } = this.buildMerkleTree(leaves);

    // Upload batch metadata to IPFS
    const metadata = {
      generatedAt: Date.now(),
      merkleRoot: root,
      txCount: leaves.length,
      payments: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        merchantAddress: p.merchantAddress,
        amount: p.amount,
        chainTxHash: p.chainTxHash,
        releasedAt: p.releasedAt,
      })),
    };
    const ipfsHash = await this.pinata.pinJSON(metadata, `batch-${Date.now()}`);

    // Commit to SettlementContract on-chain
    const contract = this.ethersService.getSettlementContract();
    const receipt = await this.ethersService.sendTransaction(contract, 'commitBatch', [
      root,
      leaves.length,
      `ipfs://${ipfsHash}`,
    ]);

    // Extract batchId from BatchCommitted event log (topic[1])
    const onChainBatchId = receipt?.logs?.[0]?.topics?.[1] ?? '';

    // Persist batch record
    const batch = this.batchRepo.create({
      onChainBatchId,
      merkleRoot: root,
      txCount: leaves.length,
      ipfsHash,
      commitTxHash: receipt?.hash ?? '',
    });
    await this.batchRepo.save(batch);

    // Mark payments as settled
    const now = new Date();
    for (const p of payments) {
      await this.paymentRepo.update({ id: p.id }, { settledInBatch: true, settledAt: now });
    }

    this.logger.log(`Batch committed: ${leaves.length} payments, root=${root}, ipfs=${ipfsHash}`);
    return { settled: leaves.length, merkleRoot: root, ipfsHash };
  }

  // ------------------------------------------------------------------
  // Merkle tree helpers
  // ------------------------------------------------------------------

  /** Leaf = keccak256(chainTxHash ++ merchantAddress ++ uint256(amountWei)) */
  buildLeaf(p: Payment): string {
    const amountWei = ethers.parseUnits(p.amount || '0', 6); // USDT 6 decimals
    return ethers.solidityPackedKeccak256(
      ['bytes32', 'address', 'uint256'],
      [p.chainTxHash, p.merchantAddress, amountWei],
    );
  }

  /** Standard binary Merkle tree. Returns root and all layers for proof generation. */
  buildMerkleTree(leaves: string[]): { root: string; layers: string[][] } {
    if (leaves.length === 0) return { root: ethers.ZeroHash, layers: [] };

    const sorted = [...leaves].sort();
    const layers: string[][] = [sorted];
    let current = sorted;

    while (current.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = i + 1 < current.length ? current[i + 1] : current[i];
        // Sort pair for deterministic root (same as merkletreejs { sort: true })
        const [a, b] = left <= right ? [left, right] : [right, left];
        next.push(ethers.keccak256(ethers.concat([a, b])));
      }
      layers.push(next);
      current = next;
    }

    return { root: current[0], layers };
  }

  getMerkleProof(layers: string[][], leafIndex: number): string[] {
    const proof: string[] = [];
    let idx = leafIndex;
    for (let i = 0; i < layers.length - 1; i++) {
      const layer = layers[i];
      const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (pairIdx < layer.length) proof.push(layer[pairIdx]);
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  async getUnbatchedReleasedPayments(): Promise<Payment[]> {
    return this.paymentRepo.find({ where: { state: PaymentState.RELEASED, settledInBatch: false } });
  }

  async getRecentBatches(limit = 20): Promise<SettlementBatch[]> {
    return this.batchRepo.find({ order: { committedAt: 'DESC' }, take: limit });
  }

  async verifyProofOnChain(batchId: string, txHash: string, proof: string[]): Promise<boolean> {
    const contract = this.ethersService.getSettlementContract();
    return contract['verifyTransaction'](batchId, txHash, proof) as Promise<boolean>;
  }
}
