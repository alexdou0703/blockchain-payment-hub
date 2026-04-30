import { Injectable, Logger } from '@nestjs/common';

const ONRAMP_FEE_RATE = 0.015;   // 1.5%
const OFFRAMP_FEE_RATE = 0.010;  // 1.0%
const FALLBACK_RATE = 25_000;    // VND per USDT — used if CoinGecko unreachable

/** Mock fiat bridge for USDT ↔ VND conversion. Uses live CoinGecko rate with fallback. */
@Injectable()
export class FiatBridgeService {
  private readonly logger = new Logger(FiatBridgeService.name);
  private cachedRate: number | null = null;
  private cacheExpiry = 0;

  /** Customer deposits VND, receives USDT minus fee */
  async onramp(customerId: string, vndAmount: number) {
    const rate = await this.getRate();
    const grossUsdt = vndAmount / rate;
    const fee = grossUsdt * ONRAMP_FEE_RATE;
    const netUsdt = grossUsdt - fee;
    this.logger.log(`Onramp: customer=${customerId} vnd=${vndAmount} → usdt=${netUsdt.toFixed(6)} rate=${rate}`);
    return {
      customerId,
      vndAmount,
      usdtAmount: parseFloat(netUsdt.toFixed(6)),
      fee: parseFloat(fee.toFixed(6)),
      exchangeRate: rate,
      note: 'Mock — no real transfer executed',
    };
  }

  /** Merchant withdraws USDT, receives VND minus fee */
  async offramp(merchantId: string, usdtAmount: number, bankAccount: string) {
    const rate = await this.getRate();
    const grossVnd = usdtAmount * rate;
    const fee = grossVnd * OFFRAMP_FEE_RATE;
    const netVnd = grossVnd - fee;
    this.logger.log(`Offramp: merchant=${merchantId} usdt=${usdtAmount} → vnd=${netVnd} bank=${bankAccount}`);
    return {
      merchantId,
      usdtAmount,
      vndAmount: Math.round(netVnd),
      fee: Math.round(fee),
      exchangeRate: rate,
      bankAccount,
      estimatedTime: '30 minutes',
      note: 'Mock — no real transfer executed',
    };
  }

  /** Live USDT/VND rate from CoinGecko (cached 60 s) */
  async getRate(): Promise<number> {
    const now = Date.now();
    if (this.cachedRate && now < this.cacheExpiry) return this.cachedRate;

    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=vnd',
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { tether: { vnd: number } };
        this.cachedRate = data.tether.vnd;
        this.cacheExpiry = now + 60_000;
        return this.cachedRate;
      }
    } catch (err: unknown) {
      this.logger.warn(`CoinGecko unreachable (${(err as Error).message}), using fallback rate`);
    }

    return FALLBACK_RATE;
  }
}
