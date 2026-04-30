import { Injectable, Logger } from '@nestjs/common';
import { EthersService } from '../blockchain/ethers.service';

/** Relays logistics delivery confirmations to the LogisticsOracle contract */
@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);

  /** orderId → confirmation count (in-memory, resets on restart) */
  private readonly confirmations = new Map<string, number>();

  constructor(private readonly ethersService: EthersService) {}

  /**
   * Submit a delivery confirmation from a logistics provider.
   * Calls LogisticsOracle.confirmDelivery on-chain.
   */
  async submitConfirmation(
    provider: string,
    orderId: string,
    trackingCode: string,
  ): Promise<{ orderId: string; confirmationCount: number }> {
    this.logger.log(`Oracle confirmation: provider=${provider} orderId=${orderId}`);
    const contract = this.ethersService.getOracleContract();
    await this.ethersService.sendTransaction(contract, 'confirmDelivery', [
      orderId,
      trackingCode,
    ]);

    const prev = this.confirmations.get(orderId) || 0;
    const count = prev + 1;
    this.confirmations.set(orderId, count);
    return { orderId, confirmationCount: count };
  }

  /** Get current confirmation count for an order */
  getStatus(orderId: string): { orderId: string; confirmationCount: number } {
    return {
      orderId,
      confirmationCount: this.confirmations.get(orderId) || 0,
    };
  }

  /**
   * DEV ONLY — simulate two provider confirmations for rapid testing.
   * Guarded by NODE_ENV !== 'production'.
   */
  async mockDeliver(orderId: string): Promise<{ orderId: string; message: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('mockDeliver is not available in production');
    }

    const mockProviders = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ];

    for (const provider of mockProviders) {
      await this.submitConfirmation(provider, orderId, `MOCK-${Date.now()}`).catch((e) =>
        this.logger.warn(`Mock delivery call failed (non-fatal): ${e.message}`),
      );
    }

    return { orderId, message: 'Mock delivery confirmations submitted' };
  }
}
