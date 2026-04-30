import { Test, TestingModule } from '@nestjs/testing';
import { OracleService } from '../src/oracle/oracle.service';
import { EthersService } from '../src/blockchain/ethers.service';
import { ConfigService } from '@nestjs/config';

/** Shared mock oracle contract — recreated before each test */
let mockConfirmDelivery: jest.Mock;
let mockOracleContract: { confirmDelivery: jest.Mock };

/** Mock EthersService — returns mock oracle contract and a noop sendTransaction */
const buildMockEthersService = () => ({
  getOracleContract: jest.fn().mockImplementation(() => mockOracleContract),
  sendTransaction: jest.fn().mockResolvedValue({}),
});

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'blockchain.usdtAddress') return '0xUSDT';
    if (key === 'blockchain.oracleAddress') return '0xORACLE';
    return undefined;
  }),
};

describe('OracleService', () => {
  let service: OracleService;
  let ethersService: ReturnType<typeof buildMockEthersService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Fresh mock contract for every test
    mockConfirmDelivery = jest.fn().mockResolvedValue({ wait: jest.fn() });
    mockOracleContract = { confirmDelivery: mockConfirmDelivery };

    ethersService = buildMockEthersService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleService,
        { provide: EthersService, useValue: ethersService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OracleService>(OracleService);
  });

  // ---------------------------------------------------------------------------
  // submitConfirmation()
  // ---------------------------------------------------------------------------
  describe('submitConfirmation()', () => {
    it('should call ethersService.sendTransaction with confirmDelivery + correct args', async () => {
      const orderId = '0xORDERID0000000000000000000000000000000000000000000000000000001';
      const trackingCode = 'TRACK-001';
      const provider = '0xProvider111';

      const result = await service.submitConfirmation(provider, orderId, trackingCode);

      expect(ethersService.getOracleContract).toHaveBeenCalled();
      expect(ethersService.sendTransaction).toHaveBeenCalledWith(
        mockOracleContract,
        'confirmDelivery',
        [orderId, trackingCode],
      );
      expect(result.orderId).toBe(orderId);
      expect(result.confirmationCount).toBe(1);
    });

    it('should increment confirmation count on repeated calls', async () => {
      const orderId = '0xORDER001';

      await service.submitConfirmation('0xP1', orderId, 'T1');
      await service.submitConfirmation('0xP2', orderId, 'T2');
      const result = await service.submitConfirmation('0xP3', orderId, 'T3');

      expect(result.confirmationCount).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // mockDeliver()
  // ---------------------------------------------------------------------------
  describe('mockDeliver()', () => {
    it('should throw an error in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await expect(service.mockDeliver('0xORDER')).rejects.toThrow(
          'mockDeliver is not available in production',
        );
      } finally {
        // Always restore env to avoid contaminating other tests
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should call submitConfirmation twice with two different providers in non-production', async () => {
      process.env.NODE_ENV = 'test';

      const orderId = '0xORDER-MOCK';
      const result = await service.mockDeliver(orderId);

      // Two providers should have triggered two sendTransaction calls
      expect(ethersService.sendTransaction).toHaveBeenCalledTimes(2);
      expect(result.orderId).toBe(orderId);
      expect(result.message).toBe('Mock delivery confirmations submitted');
    });

    it('should return confirmationCount of 2 after mockDeliver in test env', async () => {
      process.env.NODE_ENV = 'test';

      const orderId = '0xORDER-COUNT';
      await service.mockDeliver(orderId);

      const status = service.getStatus(orderId);
      expect(status.confirmationCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getStatus()
  // ---------------------------------------------------------------------------
  describe('getStatus()', () => {
    it('should return 0 confirmations for an unknown orderId', () => {
      const status = service.getStatus('0xUNKNOWN');
      expect(status.confirmationCount).toBe(0);
    });
  });
});
