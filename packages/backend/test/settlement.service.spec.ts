import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ethers } from 'ethers';
import { SettlementService } from '../src/settlement/settlement.service';
import { Payment } from '../src/payments/entities/payment.entity';
import { SettlementBatch } from '../src/settlement/entities/settlement-batch.entity';
import { EthersService } from '../src/blockchain/ethers.service';
import { PinataService } from '../src/settlement/pinata.service';
import { PaymentState } from '@payment-hub/shared';

const mockPaymentRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockBatchRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const mockContract = {
  verifyTransaction: jest.fn(),
};

const mockEthersService = {
  getSettlementContract: jest.fn(),
  sendTransaction: jest.fn(),
};

const mockPinataService = {
  pinJSON: jest.fn(),
};

function makePayment(overrides: Partial<Payment> = {}): Partial<Payment> {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    merchantAddress: '0x1234567890123456789012345678901234567890',
    amount: '10.000000',
    chainTxHash: '0x' + 'a1'.repeat(32),
    state: PaymentState.RELEASED,
    settledInBatch: false,
    releasedAt: new Date(),
    ...overrides,
  };
}

describe('SettlementService', () => {
  let service: SettlementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEthersService.getSettlementContract.mockReturnValue(mockContract);
    mockEthersService.sendTransaction.mockResolvedValue({
      hash: '0xBatchTx',
      logs: [{ topics: ['0xEvent', '0x1'] }],
    });
    mockPinataService.pinJSON.mockResolvedValue('QmTestHash');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(SettlementBatch), useValue: mockBatchRepo },
        { provide: EthersService, useValue: mockEthersService },
        { provide: PinataService, useValue: mockPinataService },
      ],
    }).compile();

    service = module.get<SettlementService>(SettlementService);
  });

  // ---------------------------------------------------------------------------
  // buildLeaf()
  // ---------------------------------------------------------------------------
  describe('buildLeaf()', () => {
    it('should produce a deterministic bytes32 hash', () => {
      const payment = makePayment() as Payment;
      const leaf1 = service.buildLeaf(payment);
      const leaf2 = service.buildLeaf(payment);
      expect(leaf1).toBe(leaf2);
      expect(leaf1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should handle amount="0" without throwing', () => {
      const payment = makePayment({ amount: '0' }) as Payment;
      expect(() => service.buildLeaf(payment)).not.toThrow();
    });

    it('should produce different hashes for different amounts', () => {
      const p1 = makePayment({ amount: '10.000000' }) as Payment;
      const p2 = makePayment({ amount: '20.000000' }) as Payment;
      expect(service.buildLeaf(p1)).not.toBe(service.buildLeaf(p2));
    });
  });

  // ---------------------------------------------------------------------------
  // buildMerkleTree()
  // ---------------------------------------------------------------------------
  describe('buildMerkleTree()', () => {
    it('should return ZeroHash for empty leaves', () => {
      const { root, layers } = service.buildMerkleTree([]);
      expect(root).toBe(ethers.ZeroHash);
      expect(layers).toEqual([]);
    });

    it('should return the single leaf as root for one-element input', () => {
      const leaf = '0x' + 'ab'.repeat(32);
      const { root, layers } = service.buildMerkleTree([leaf]);
      expect(root).toBe(leaf);
      expect(layers.length).toBe(1);
    });

    it('should produce a deterministic root for two leaves', () => {
      const leaves = ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)];
      const { root, layers } = service.buildMerkleTree(leaves);
      expect(root).toMatch(/^0x[0-9a-f]{64}$/);
      expect(layers.length).toBe(2);
      expect(service.buildMerkleTree(leaves).root).toBe(root);
    });

    it('should handle 3 leaves (odd count) — parent layer has 2 nodes', () => {
      const leaves = ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32), '0x' + 'cc'.repeat(32)];
      const { layers } = service.buildMerkleTree(leaves);
      expect(layers[0].length).toBe(3);
      expect(layers[1].length).toBe(2);
    });

    it('should produce 3 layers for 4 leaves (power of 2)', () => {
      const leaves = [
        '0x' + 'aa'.repeat(32),
        '0x' + 'bb'.repeat(32),
        '0x' + 'cc'.repeat(32),
        '0x' + 'dd'.repeat(32),
      ];
      const { root, layers } = service.buildMerkleTree(leaves);
      expect(layers.length).toBe(3);
      expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  // ---------------------------------------------------------------------------
  // getMerkleProof()
  // ---------------------------------------------------------------------------
  describe('getMerkleProof()', () => {
    it('should return empty array for single-leaf tree', () => {
      const { layers } = service.buildMerkleTree(['0x' + 'aa'.repeat(32)]);
      expect(service.getMerkleProof(layers, 0)).toEqual([]);
    });

    it('should return the sibling for 2-leaf tree at index 0', () => {
      const leaves = ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)];
      const { layers } = service.buildMerkleTree(leaves);
      const sorted = [...leaves].sort();
      const proof = service.getMerkleProof(layers, 0);
      expect(proof).toHaveLength(1);
      expect(proof[0]).toBe(sorted[1]);
    });

    it('should return the sibling for 2-leaf tree at index 1', () => {
      const leaves = ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)];
      const { layers } = service.buildMerkleTree(leaves);
      const sorted = [...leaves].sort();
      const proof = service.getMerkleProof(layers, 1);
      expect(proof).toHaveLength(1);
      expect(proof[0]).toBe(sorted[0]);
    });
  });

  // ---------------------------------------------------------------------------
  // getUnbatchedReleasedPayments()
  // ---------------------------------------------------------------------------
  describe('getUnbatchedReleasedPayments()', () => {
    it('should query with correct where clause', async () => {
      const payments = [makePayment()];
      mockPaymentRepo.find.mockResolvedValue(payments);

      const result = await service.getUnbatchedReleasedPayments();

      expect(mockPaymentRepo.find).toHaveBeenCalledWith({
        where: { state: PaymentState.RELEASED, settledInBatch: false },
      });
      expect(result).toEqual(payments);
    });
  });

  // ---------------------------------------------------------------------------
  // getRecentBatches()
  // ---------------------------------------------------------------------------
  describe('getRecentBatches()', () => {
    it('should default to limit 20', async () => {
      mockBatchRepo.find.mockResolvedValue([]);
      await service.getRecentBatches();
      expect(mockBatchRepo.find).toHaveBeenCalledWith({
        order: { committedAt: 'DESC' },
        take: 20,
      });
    });

    it('should use explicit limit when provided', async () => {
      mockBatchRepo.find.mockResolvedValue([]);
      await service.getRecentBatches(5);
      expect(mockBatchRepo.find).toHaveBeenCalledWith({
        order: { committedAt: 'DESC' },
        take: 5,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // runBatchSettlement()
  // ---------------------------------------------------------------------------
  describe('runBatchSettlement()', () => {
    it('should return zero settled when no unbatched payments exist', async () => {
      mockPaymentRepo.find.mockResolvedValue([]);

      const result = await service.runBatchSettlement();

      expect(result).toEqual({ settled: 0, merkleRoot: ethers.ZeroHash, ipfsHash: '' });
      expect(mockPinataService.pinJSON).not.toHaveBeenCalled();
      expect(mockEthersService.sendTransaction).not.toHaveBeenCalled();
    });

    it('should skip and warn when all payments lack chainTxHash', async () => {
      const payment = makePayment({ chainTxHash: null as any }) as Payment;
      mockPaymentRepo.find.mockResolvedValue([payment]);

      const result = await service.runBatchSettlement();

      expect(result.settled).toBe(0);
      expect(mockPinataService.pinJSON).not.toHaveBeenCalled();
      expect(mockEthersService.sendTransaction).not.toHaveBeenCalled();
    });

    it('should commit batch and mark payments settled on happy path', async () => {
      const paymentA = makePayment({ id: 'pay-a', chainTxHash: '0x' + 'a1'.repeat(32) }) as Payment;
      const paymentB = makePayment({
        id: 'pay-b',
        chainTxHash: '0x' + 'b2'.repeat(32),
        amount: '20.000000',
      }) as Payment;
      mockPaymentRepo.find.mockResolvedValue([paymentA, paymentB]);

      const savedBatch = { id: 'batch-1' };
      mockBatchRepo.create.mockReturnValue(savedBatch);
      mockBatchRepo.save.mockResolvedValue(savedBatch);
      mockPaymentRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.runBatchSettlement();

      // Pinata called with correct metadata shape
      expect(mockPinataService.pinJSON).toHaveBeenCalledTimes(1);
      const pinataArg = mockPinataService.pinJSON.mock.calls[0][0] as Record<string, unknown>;
      expect(pinataArg.txCount).toBe(2);
      expect((pinataArg.payments as unknown[]).length).toBe(2);

      // On-chain commit called with correct args
      expect(mockEthersService.sendTransaction).toHaveBeenCalledWith(
        mockContract,
        'commitBatch',
        [expect.stringMatching(/^0x[0-9a-f]{64}$/), 2, 'ipfs://QmTestHash'],
      );

      // Batch record persisted
      expect(mockBatchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merkleRoot: expect.stringMatching(/^0x/),
          txCount: 2,
          ipfsHash: 'QmTestHash',
          commitTxHash: '0xBatchTx',
        }),
      );
      expect(mockBatchRepo.save).toHaveBeenCalled();

      // Both payments marked settled
      expect(mockPaymentRepo.update).toHaveBeenCalledTimes(2);
      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        { id: 'pay-a' },
        { settledInBatch: true, settledAt: expect.any(Date) },
      );
      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        { id: 'pay-b' },
        { settledInBatch: true, settledAt: expect.any(Date) },
      );

      // Return value
      expect(result.settled).toBe(2);
      expect(result.merkleRoot).toMatch(/^0x/);
      expect(result.ipfsHash).toBe('QmTestHash');
    });
  });

  // ---------------------------------------------------------------------------
  // verifyProofOnChain()
  // ---------------------------------------------------------------------------
  describe('verifyProofOnChain()', () => {
    it('should call contract.verifyTransaction with correct args and return result', async () => {
      mockContract.verifyTransaction.mockResolvedValue(true);

      const txHash = '0x' + 'aa'.repeat(32);
      const proof = ['0x' + 'bb'.repeat(32)];
      const result = await service.verifyProofOnChain('42', txHash, proof);

      expect(mockEthersService.getSettlementContract).toHaveBeenCalled();
      expect(mockContract.verifyTransaction).toHaveBeenCalledWith('42', txHash, proof);
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // scheduledSettlement() — error swallowing
  // ---------------------------------------------------------------------------
  describe('scheduledSettlement()', () => {
    it('should resolve without throwing when runBatchSettlement throws', async () => {
      mockPaymentRepo.find.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.scheduledSettlement()).resolves.toBeUndefined();
    });
  });
});
