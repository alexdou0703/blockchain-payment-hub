import { Test, TestingModule } from '@nestjs/testing';
import { FiatBridgeService } from '../src/fiat/fiat-bridge.service';

const FALLBACK_RATE = 25_000;

describe('FiatBridgeService', () => {
  let service: FiatBridgeService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');

    const module: TestingModule = await Test.createTestingModule({
      providers: [FiatBridgeService],
    }).compile();

    service = module.get<FiatBridgeService>(FiatBridgeService);
  });

  afterEach(() => {
    jest.useRealTimers();
    fetchSpy.mockRestore();
  });

  function mockCoinGeckoRate(rate: number) {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tether: { vnd: rate } }),
    } as unknown as Response);
  }

  // ---------------------------------------------------------------------------
  // getRate()
  // ---------------------------------------------------------------------------
  describe('getRate()', () => {
    it('should fetch live rate from CoinGecko and return it', async () => {
      mockCoinGeckoRate(26_000);

      const rate = await service.getRate();

      expect(rate).toBe(26_000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('coingecko.com'),
        expect.any(Object),
      );
    });

    it('should return cached rate on second call within 60 s', async () => {
      mockCoinGeckoRate(26_000);

      await service.getRate();
      const rate = await service.getRate();

      expect(rate).toBe(26_000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should re-fetch after cache expires (> 60 s)', async () => {
      jest.useFakeTimers();

      mockCoinGeckoRate(25_000);
      await service.getRate();

      jest.advanceTimersByTime(61_000);

      mockCoinGeckoRate(27_000);
      const rate = await service.getRate();

      expect(rate).toBe(27_000);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should return FALLBACK_RATE when fetch throws', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network timeout'));

      const rate = await service.getRate();

      expect(rate).toBe(FALLBACK_RATE);
    });

    it('should return FALLBACK_RATE when response is not ok', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false } as unknown as Response);

      const rate = await service.getRate();

      expect(rate).toBe(FALLBACK_RATE);
    });
  });

  // ---------------------------------------------------------------------------
  // onramp()
  // ---------------------------------------------------------------------------
  describe('onramp()', () => {
    it('should calculate correct USDT amount and 1.5% fee at rate 25000', async () => {
      mockCoinGeckoRate(25_000);

      const result = await service.onramp('cust-1', 250_000);

      // grossUsdt = 250000 / 25000 = 10; fee = 10 * 0.015 = 0.15; net = 9.85
      expect(result.usdtAmount).toBe(9.85);
      expect(result.fee).toBe(0.15);
      expect(result.exchangeRate).toBe(25_000);
      expect(result.customerId).toBe('cust-1');
      expect(result.vndAmount).toBe(250_000);
      expect(result.note).toContain('Mock');
    });

    it('should use fallback rate when CoinGecko is unavailable', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('timeout'));

      const result = await service.onramp('cust-2', 25_000);

      // grossUsdt = 25000 / 25000 = 1; fee = 0.015; net = 0.985
      expect(result.exchangeRate).toBe(FALLBACK_RATE);
      expect(result.usdtAmount).toBeCloseTo(0.985, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // offramp()
  // ---------------------------------------------------------------------------
  describe('offramp()', () => {
    it('should calculate correct VND amount and 1.0% fee at rate 25000', async () => {
      mockCoinGeckoRate(25_000);

      const result = await service.offramp('merch-1', 10, '9704001234567890');

      // grossVnd = 10 * 25000 = 250000; fee = 250000 * 0.01 = 2500; net = 247500
      expect(result.vndAmount).toBe(247_500);
      expect(result.fee).toBe(2_500);
      expect(result.exchangeRate).toBe(25_000);
      expect(result.merchantId).toBe('merch-1');
      expect(result.usdtAmount).toBe(10);
      expect(result.bankAccount).toBe('9704001234567890');
      expect(result.estimatedTime).toBe('30 minutes');
      expect(result.note).toContain('Mock');
    });
  });
});
