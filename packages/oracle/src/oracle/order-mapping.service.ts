import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';

/**
 * Maps logistics tracking codes (e.g. GHN order_code) to on-chain bytes32 orderIds.
 * The backend calls POST /mapping/register when a merchant ships an order.
 * Falls back to keccak256(trackingCode) if no explicit mapping exists.
 */
@Injectable()
export class OrderMappingService {
  private readonly logger = new Logger(OrderMappingService.name);
  // trackingCode → bytes32 orderId (0x-prefixed, 66 chars)
  private readonly store = new Map<string, string>();

  register(trackingCode: string, orderId: string): void {
    const normalized = this.toBytes32(orderId);
    this.store.set(trackingCode, normalized);
    this.logger.log(`Mapping registered: ${trackingCode} → ${normalized}`);
  }

  /**
   * Resolves a tracking code to a bytes32 orderId.
   * Priority: explicit mapping → keccak256(trackingCode) as fallback.
   */
  resolve(trackingCode: string): string {
    const explicit = this.store.get(trackingCode);
    if (explicit) return explicit;

    // Fallback: hash the tracking code — useful in dev where orderId = hash
    const derived = ethers.keccak256(ethers.toUtf8Bytes(trackingCode));
    this.logger.debug(`No mapping for ${trackingCode}; using keccak256 → ${derived}`);
    return derived;
  }

  /** Converts a string to 32-byte hex. If already bytes32, returns as-is. */
  toBytes32(value: string): string {
    if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value;
    return ethers.keccak256(ethers.toUtf8Bytes(value));
  }

  listAll(): Record<string, string> {
    return Object.fromEntries(this.store);
  }
}
