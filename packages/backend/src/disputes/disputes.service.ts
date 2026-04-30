import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Dispute } from './entities/dispute.entity';
import { DisputeState } from '@payment-hub/shared';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
  ) {}

  /** Auto-create dispute record when EscrowDisputed event fires on-chain */
  @OnEvent('escrow.disputed')
  async onEscrowDisputed(payload: { orderId: string; initiator: string }) {
    try {
      const existing = await this.disputeRepo.findOne({ where: { orderId: payload.orderId } });
      if (!existing) {
        await this.createDisputeRecord(payload.orderId, payload.initiator);
        this.logger.log(`Dispute auto-created for order ${payload.orderId}`);
      }
    } catch (e) {
      this.logger.error(`onEscrowDisputed error: ${e.message}`);
    }
  }

  /** Create a new dispute record for the given order */
  async createDisputeRecord(orderId: string, initiatorAddress: string): Promise<Dispute> {
    const dispute = this.disputeRepo.create({
      orderId,
      initiatorAddress,
      state: DisputeState.OPEN,
      evidenceHashes: [],
    });
    return this.disputeRepo.save(dispute);
  }

  async findById(id: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) {
      throw new NotFoundException(`Dispute ${id} not found`);
    }
    return dispute;
  }

  /** Append an IPFS evidence hash to the dispute record */
  async addEvidence(id: string, ipfsHash: string): Promise<Dispute> {
    const dispute = await this.findById(id);
    dispute.evidenceHashes = [...(dispute.evidenceHashes || []), ipfsHash];
    return this.disputeRepo.save(dispute);
  }

  /** Update dispute state after on-chain ruling or appeal */
  async updateState(
    orderId: string,
    state: DisputeState,
    ruling?: string,
    sellerBasisPoints?: number,
  ): Promise<void> {
    const updates: Partial<Dispute> = { state };
    if (ruling !== undefined) updates.ruling = ruling;
    if (sellerBasisPoints !== undefined) updates.sellerBasisPoints = sellerBasisPoints;
    await this.disputeRepo.update({ orderId }, updates);
  }
}
