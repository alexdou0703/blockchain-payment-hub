import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DisputesService } from '../src/disputes/disputes.service';
import { Dispute } from '../src/disputes/entities/dispute.entity';
import { DisputeState } from '@payment-hub/shared';

/** Mock TypeORM repository */
const mockDisputeRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};

describe('DisputesService', () => {
  let service: DisputesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: getRepositoryToken(Dispute), useValue: mockDisputeRepo },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
  });

  // ---------------------------------------------------------------------------
  // createDisputeRecord()
  // ---------------------------------------------------------------------------
  describe('createDisputeRecord()', () => {
    it('should create and save a dispute with OPEN state', async () => {
      const builtDispute: Partial<Dispute> = {
        orderId: 'order-1',
        initiatorAddress: '0xInitiator',
        state: DisputeState.OPEN,
        evidenceHashes: [],
      };
      const savedDispute = { id: 'disp-1', ...builtDispute };

      mockDisputeRepo.create.mockReturnValue(builtDispute);
      mockDisputeRepo.save.mockResolvedValue(savedDispute);

      const result = await service.createDisputeRecord('order-1', '0xInitiator');

      expect(mockDisputeRepo.create).toHaveBeenCalledWith({
        orderId: 'order-1',
        initiatorAddress: '0xInitiator',
        state: DisputeState.OPEN,
        evidenceHashes: [],
      });
      expect(mockDisputeRepo.save).toHaveBeenCalledWith(builtDispute);
      expect(result).toEqual(savedDispute);
    });
  });

  // ---------------------------------------------------------------------------
  // findById()
  // ---------------------------------------------------------------------------
  describe('findById()', () => {
    it('should throw NotFoundException when dispute does not exist', async () => {
      mockDisputeRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('missing-id')).rejects.toThrow(
        'Dispute missing-id not found',
      );
    });

    it('should return the dispute when found', async () => {
      const dispute: Partial<Dispute> = {
        id: 'disp-1',
        orderId: 'order-1',
        state: DisputeState.OPEN,
      };
      mockDisputeRepo.findOne.mockResolvedValue(dispute);

      const result = await service.findById('disp-1');

      expect(mockDisputeRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'disp-1' },
      });
      expect(result).toEqual(dispute);
    });
  });

  // ---------------------------------------------------------------------------
  // addEvidence()
  // ---------------------------------------------------------------------------
  describe('addEvidence()', () => {
    it('should append ipfsHash to existing evidenceHashes array', async () => {
      const dispute: Partial<Dispute> = {
        id: 'disp-1',
        orderId: 'order-1',
        state: DisputeState.OPEN,
        evidenceHashes: ['Qm111'],
      };
      const updatedDispute = {
        ...dispute,
        evidenceHashes: ['Qm111', 'Qm222'],
      };

      mockDisputeRepo.findOne.mockResolvedValue(dispute);
      mockDisputeRepo.save.mockResolvedValue(updatedDispute);

      const result = await service.addEvidence('disp-1', 'Qm222');

      expect(mockDisputeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ evidenceHashes: ['Qm111', 'Qm222'] }),
      );
      expect(result).toEqual(updatedDispute);
    });

    it('should handle empty evidenceHashes by creating a new array', async () => {
      const dispute: Partial<Dispute> = {
        id: 'disp-1',
        orderId: 'order-1',
        state: DisputeState.OPEN,
        evidenceHashes: [],
      };
      mockDisputeRepo.findOne.mockResolvedValue(dispute);
      mockDisputeRepo.save.mockImplementation((d) => Promise.resolve({ ...d }));

      const result = await service.addEvidence('disp-1', 'Qm999');

      expect(result.evidenceHashes).toEqual(['Qm999']);
    });
  });

  // ---------------------------------------------------------------------------
  // updateState()
  // ---------------------------------------------------------------------------
  describe('updateState()', () => {
    it('should call repo.update with state, ruling, and sellerBasisPoints', async () => {
      mockDisputeRepo.update.mockResolvedValue({ affected: 1 });

      await service.updateState('order-1', DisputeState.RESOLVED, 'RELEASE', 7500);

      expect(mockDisputeRepo.update).toHaveBeenCalledWith(
        { orderId: 'order-1' },
        { state: DisputeState.RESOLVED, ruling: 'RELEASE', sellerBasisPoints: 7500 },
      );
    });

    it('should update state without optional ruling/sellerBasisPoints when not provided', async () => {
      mockDisputeRepo.update.mockResolvedValue({ affected: 1 });

      await service.updateState('order-1', DisputeState.VOTING);

      const [whereArg, updatesArg] = mockDisputeRepo.update.mock.calls[0];
      expect(whereArg).toEqual({ orderId: 'order-1' });
      expect(updatesArg.state).toBe(DisputeState.VOTING);
      expect(updatesArg.ruling).toBeUndefined();
      expect(updatesArg.sellerBasisPoints).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // onEscrowDisputed() — event handler
  // ---------------------------------------------------------------------------
  describe('onEscrowDisputed()', () => {
    it('should call createDisputeRecord when no existing dispute found', async () => {
      // No existing dispute
      mockDisputeRepo.findOne.mockResolvedValue(null);
      // create + save for the new record
      const newDispute: Partial<Dispute> = {
        id: 'disp-new',
        orderId: 'order-1',
        initiatorAddress: '0xBuyer',
        state: DisputeState.OPEN,
        evidenceHashes: [],
      };
      mockDisputeRepo.create.mockReturnValue(newDispute);
      mockDisputeRepo.save.mockResolvedValue(newDispute);

      await service.onEscrowDisputed({ orderId: 'order-1', initiator: '0xBuyer' });

      expect(mockDisputeRepo.findOne).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
      });
      expect(mockDisputeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          initiatorAddress: '0xBuyer',
          state: DisputeState.OPEN,
        }),
      );
      expect(mockDisputeRepo.save).toHaveBeenCalled();
    });

    it('should skip creation when a dispute already exists for the order', async () => {
      const existingDispute: Partial<Dispute> = {
        id: 'disp-existing',
        orderId: 'order-1',
        state: DisputeState.OPEN,
      };
      mockDisputeRepo.findOne.mockResolvedValue(existingDispute);

      await service.onEscrowDisputed({ orderId: 'order-1', initiator: '0xBuyer' });

      // save should NOT be called because dispute already exists
      expect(mockDisputeRepo.create).not.toHaveBeenCalled();
      expect(mockDisputeRepo.save).not.toHaveBeenCalled();
    });
  });
});
