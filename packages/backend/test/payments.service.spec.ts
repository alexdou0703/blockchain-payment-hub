import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../src/payments/payments.service';
import { Payment } from '../src/payments/entities/payment.entity';
import { PaymentState } from '@payment-hub/shared';

/** Mock TypeORM repository */
const mockPaymentRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  // ---------------------------------------------------------------------------
  // findById()
  // ---------------------------------------------------------------------------
  describe('findById()', () => {
    it('should throw NotFoundException when payment does not exist', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('missing-id')).rejects.toThrow(
        'Payment missing-id not found',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findByOrderId()
  // ---------------------------------------------------------------------------
  describe('findByOrderId()', () => {
    it('should return payment when found by orderId', async () => {
      const payment: Partial<Payment> = {
        id: 'pay-1',
        orderId: 'order-1',
        state: PaymentState.PENDING,
      };
      mockPaymentRepo.findOne.mockResolvedValue(payment);

      const result = await service.findByOrderId('order-1');

      expect(mockPaymentRepo.findOne).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
      });
      expect(result).toEqual(payment);
    });

    it('should throw NotFoundException when payment for order does not exist', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);

      await expect(service.findByOrderId('order-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateState()
  // ---------------------------------------------------------------------------
  describe('updateState()', () => {
    it('should call repo.update with LOCKED state and set lockedAt', async () => {
      mockPaymentRepo.update.mockResolvedValue({ affected: 1 });

      const before = Date.now();
      await service.updateState('pay-1', PaymentState.LOCKED);
      const after = Date.now();

      const [whereArg, updatesArg] = mockPaymentRepo.update.mock.calls[0];
      expect(whereArg).toEqual({ id: 'pay-1' });
      expect(updatesArg.state).toBe(PaymentState.LOCKED);
      // lockedAt should be a Date within the test window
      expect(updatesArg.lockedAt).toBeInstanceOf(Date);
      expect(updatesArg.lockedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(updatesArg.lockedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should call repo.update with RELEASED state and set releasedAt', async () => {
      mockPaymentRepo.update.mockResolvedValue({ affected: 1 });

      await service.updateState('pay-1', PaymentState.RELEASED);

      const [, updatesArg] = mockPaymentRepo.update.mock.calls[0];
      expect(updatesArg.state).toBe(PaymentState.RELEASED);
      expect(updatesArg.releasedAt).toBeInstanceOf(Date);
    });

    it('should call repo.update with DISPUTED state without timestamp fields', async () => {
      mockPaymentRepo.update.mockResolvedValue({ affected: 1 });

      await service.updateState('pay-1', PaymentState.DISPUTED);

      const [whereArg, updatesArg] = mockPaymentRepo.update.mock.calls[0];
      expect(whereArg).toEqual({ id: 'pay-1' });
      expect(updatesArg.state).toBe(PaymentState.DISPUTED);
      expect(updatesArg.lockedAt).toBeUndefined();
      expect(updatesArg.releasedAt).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // confirmSignature()
  // ---------------------------------------------------------------------------
  describe('confirmSignature()', () => {
    it('should call repo.update with merchantSignature and return updated payment', async () => {
      const existingPayment: Partial<Payment> = {
        id: 'pay-1',
        state: PaymentState.PENDING,
        merchantSignature: null,
      };
      const updatedPayment: Partial<Payment> = {
        ...existingPayment,
        merchantSignature: '0xSIG',
      };

      // findById is called twice: once to verify existence, once to return result
      mockPaymentRepo.findOne
        .mockResolvedValueOnce(existingPayment)  // first call — existence check
        .mockResolvedValueOnce(updatedPayment);   // second call — return updated

      mockPaymentRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.confirmSignature('pay-1', '0xSIG');

      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        { id: 'pay-1' },
        { merchantSignature: '0xSIG' },
      );
      expect(result).toEqual(updatedPayment);
    });
  });
});
