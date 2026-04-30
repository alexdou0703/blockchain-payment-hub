import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import {
  ESCROW_ABI,
  DISPUTE_ABI,
  ORACLE_ABI,
  SETTLEMENT_ABI,
} from '@payment-hub/shared';

/** Provides initialized ethers providers, signers, and contract instances */
@Injectable()
export class EthersService {
  private readonly logger = new Logger(EthersService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private wsProvider: ethers.WebSocketProvider | null = null;
  private signer: ethers.Wallet | null = null;

  constructor(private readonly config: ConfigService) {}

  /** HTTP provider — used for read calls and sending transactions */
  getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      const rpcUrl = this.config.get<string>('blockchain.sepoliaRpc');
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }
    return this.provider;
  }

  /** WebSocket provider — used for real-time event listening */
  getWsProvider(): ethers.WebSocketProvider | null {
    const wsUrl = this.config.get<string>('blockchain.sepoliaWs');
    if (!wsUrl) return null;
    if (!this.wsProvider) {
      this.wsProvider = new ethers.WebSocketProvider(wsUrl);
    }
    return this.wsProvider;
  }

  /** Wallet signer backed by DEPLOYER_PRIVATE_KEY */
  getSigner(): ethers.Wallet {
    if (!this.signer) {
      const key = this.config.get<string>('blockchain.deployerKey');
      this.signer = new ethers.Wallet(key, this.getProvider());
    }
    return this.signer;
  }

  getEscrowContract(): ethers.Contract {
    const addr = this.config.get<string>('blockchain.escrowAddress');
    return new ethers.Contract(addr, [...ESCROW_ABI], this.getSigner());
  }

  getDisputeContract(): ethers.Contract {
    const addr = this.config.get<string>('blockchain.disputeAddress');
    return new ethers.Contract(addr, [...DISPUTE_ABI], this.getSigner());
  }

  getOracleContract(): ethers.Contract {
    const addr = this.config.get<string>('blockchain.oracleAddress');
    return new ethers.Contract(addr, [...ORACLE_ABI], this.getSigner());
  }

  getSettlementContract(): ethers.Contract {
    const addr = this.config.get<string>('blockchain.settlementAddress');
    return new ethers.Contract(addr, [...SETTLEMENT_ABI], this.getSigner());
  }

  /**
   * Generic transaction sender — sends, waits for 1 confirmation, returns receipt.
   * Logs the contract name, method, and resulting tx hash.
   */
  async sendTransaction(
    contract: ethers.Contract,
    method: string,
    args: unknown[],
  ): Promise<ethers.TransactionReceipt> {
    this.logger.log(`Sending tx → ${method}(${args.join(', ')})`);
    const tx: ethers.TransactionResponse = await contract[method](...args);
    const receipt = await tx.wait(1);
    this.logger.log(`Tx confirmed: ${tx.hash}`);
    return receipt;
  }
}
