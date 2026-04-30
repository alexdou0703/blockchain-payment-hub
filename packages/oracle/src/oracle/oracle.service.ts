import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractService, ProviderName } from '../blockchain/contract.service';
import { OrderMappingService } from './order-mapping.service';

const PROVIDER_NAMES: ProviderName[] = ['GHN', 'GHTK', 'VIETTEL'];

/** Core oracle logic — resolves orderId, calls on-chain confirmDelivery, logs to backend */
@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);
  private readonly backendUrl: string;

  constructor(
    private readonly contracts: ContractService,
    private readonly mapping: OrderMappingService,
    private readonly config: ConfigService,
  ) {
    this.backendUrl = this.config.get<string>('backendApiUrl') ?? 'http://localhost:3001';
  }

  /**
   * Submit a delivery confirmation for a logistics provider.
   * Resolves trackingCode → bytes32 orderId, calls the contract, notifies backend.
   */
  async submitConfirmation(
    providerName: ProviderName,
    trackingCode: string,
  ): Promise<{ orderId: string; txHash: string; provider: string }> {
    const orderId = this.mapping.resolve(trackingCode);
    this.logger.log(`submitConfirmation provider=${providerName} trackingCode=${trackingCode} orderId=${orderId}`);

    const txHash = await this.contracts.confirmDelivery(providerName, orderId, trackingCode);

    // Fire-and-forget notification to backend for DB logging
    this.notifyBackend(providerName, orderId, trackingCode, txHash).catch((err) =>
      this.logger.warn(`Backend notification failed (non-fatal): ${err.message}`),
    );

    return { orderId, txHash, provider: providerName };
  }

  /**
   * DEV ONLY — simulate 2-of-3 provider confirmations to reach consensus.
   * Uses GHN + GHTK signers. Blocked in production.
   */
  async mockDeliver(
    orderId: string,
  ): Promise<{ orderId: string; results: { provider: string; txHash: string }[] }> {
    if (this.config.get<string>('nodeEnv') === 'production') {
      throw new ForbiddenException('mockDeliver is not available in production');
    }

    // Register a direct orderId → orderId mapping so no keccak re-hashing happens
    this.mapping.register(orderId, orderId);

    const results: { provider: string; txHash: string }[] = [];
    // Use first 2 providers to reach 2-of-3 consensus
    for (const prov of PROVIDER_NAMES.slice(0, 2)) {
      try {
        const mockTracking = `MOCK-${prov}-${Date.now()}`;
        this.mapping.register(mockTracking, orderId);
        const txHash = await this.contracts.confirmDelivery(prov, orderId, mockTracking);
        results.push({ provider: prov, txHash });
      } catch (err: unknown) {
        this.logger.warn(`Mock delivery ${prov} failed (non-fatal): ${(err as Error).message}`);
        results.push({ provider: prov, txHash: 'FAILED' });
      }
    }

    return { orderId, results };
  }

  async getStatus(orderId: string): Promise<{ orderId: string; confirmationCount: number; delivered: boolean }> {
    const bytes32Id = this.mapping.toBytes32(orderId);
    const [count, delivered] = await Promise.all([
      this.contracts.getConfirmationCount(bytes32Id),
      this.contracts.isDelivered(bytes32Id),
    ]);
    return { orderId, confirmationCount: count, delivered };
  }

  private async notifyBackend(
    provider: string,
    orderId: string,
    trackingCode: string,
    txHash: string,
  ): Promise<void> {
    const url = `${this.backendUrl}/api/v1/oracle/delivery`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, orderId, trackingCode, txHash }),
    });
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  }
}
