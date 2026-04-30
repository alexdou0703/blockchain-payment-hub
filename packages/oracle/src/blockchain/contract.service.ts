import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { ORACLE_ABI } from '@payment-hub/shared';

export type ProviderName = 'GHN' | 'GHTK' | 'VIETTEL';

/** Holds one ethers signer + LogisticsOracle contract instance per logistics provider */
@Injectable()
export class ContractService implements OnModuleInit {
  private readonly logger = new Logger(ContractService.name);
  private provider: ethers.JsonRpcProvider;
  // One contract instance per provider signer
  private contracts = new Map<ProviderName, ethers.Contract>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const rpc = this.config.get<string>('blockchain.sepoliaRpc');
    const addr = this.config.get<string>('blockchain.oracleAddress');
    this.provider = new ethers.JsonRpcProvider(rpc);

    const keyMap: Record<ProviderName, string> = {
      GHN: this.config.get<string>('blockchain.ghnKey') ?? '',
      GHTK: this.config.get<string>('blockchain.ghtkKey') ?? '',
      VIETTEL: this.config.get<string>('blockchain.viettelKey') ?? '',
    };

    for (const [name, key] of Object.entries(keyMap) as [ProviderName, string][]) {
      if (!key || !addr || addr === ethers.ZeroAddress) {
        this.logger.warn(`Skipping ${name} signer — missing key or contract address`);
        continue;
      }
      const signer = new ethers.Wallet(key, this.provider);
      this.contracts.set(name, new ethers.Contract(addr, [...ORACLE_ABI], signer));
      this.logger.log(`Initialized ${name} signer: ${signer.address}`);
    }
  }

  getContract(provider: ProviderName): ethers.Contract {
    const c = this.contracts.get(provider);
    if (!c) throw new Error(`No contract configured for provider: ${provider}`);
    return c;
  }

  /** Returns the first available contract (read-only queries) */
  getReadContract(): ethers.Contract {
    const first = this.contracts.values().next().value;
    if (!first) throw new Error('No provider contracts initialized');
    return first;
  }

  /**
   * Sends a confirmDelivery transaction with retry.
   * orderId must be a 32-byte hex string (0x-prefixed).
   */
  async confirmDelivery(
    providerName: ProviderName,
    orderId: string,
    trackingCode: string,
    maxRetries = 3,
  ): Promise<string> {
    const contract = this.getContract(providerName);
    let lastErr: Error = new Error('No attempts made');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tx: ethers.TransactionResponse = await contract['confirmDelivery'](orderId, trackingCode);
        await tx.wait(1);
        this.logger.log(`confirmDelivery confirmed: provider=${providerName} tx=${tx.hash}`);
        return tx.hash;
      } catch (err: unknown) {
        lastErr = err as Error;
        const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
        this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${lastErr.message}. Retrying in ${delay}ms`);
        if (attempt < maxRetries) await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastErr;
  }

  /** Read current confirmation count for an order (from chain) */
  async getConfirmationCount(orderId: string): Promise<number> {
    const c = this.getReadContract();
    const count: bigint = await c['confirmationCount'](orderId);
    return Number(count);
  }

  /** Read delivered flag from contract */
  async isDelivered(orderId: string): Promise<boolean> {
    const c = this.getReadContract();
    return c['delivered'](orderId) as Promise<boolean>;
  }
}
