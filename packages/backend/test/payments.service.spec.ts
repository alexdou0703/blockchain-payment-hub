import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../src/payments/payments.service';
import { Payment } from '../src/payments/entities/payment.entity';
import { Order } from '../src/orders/entities/order.entity';
import { EthersService } from '../src/blockchain/ethers.service';
import { PaymentState } from '@payment-hub/shared';

/** Mock TypeORM repositories */
const mockPaymentRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};

const mockOrderRepo = {
  findOne: jest.fn(),
};

/**
 * Stub signer — service falls into _signPayload only when merchantSignature
 * is missing. Tests below pre-populate merchantSignature so the signing path
 * stays out of unit-test territory; this mock only exists to satisfy DI.
 */
const mockEthersService = {
  getSigner: jest.fn().mockReturnValue({
    provider: { getNetwork: jest.fn().mockResolvedValue({ chainId: 11155111n }) },
    signTypedData: jest.fn().mockResolvedValue('0xSIG_FROM_STUB'),
  }),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Order),   useValue: mockOrderRepo },
        { provide: EthersService,               useValue: mockEthersService },
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
    const farFutureDeadline = Math.floor(Date.now() / 1000) + 86_400;

    it('should return enriched payment payload when found by orderId', async () => {
      const payment: Partial<Payment> = {
        id: 'pay-1',
        orderId: 'order-1',
        merchantAddress: '0x1111111111111111111111111111111111111111',
        customerAddress: '0x2222222222222222222222222222222222222222',
        tokenAddress:    '0x3333333333333333333333333333333333333333',
        amount: '50.000000' as unknown as Payment['amount'],
        nonce: '0x' + 'aa'.repeat(32),
        deadline: farFutureDeadline as unknown as Payment['deadline'],
        merchantSignature: '0xPRESIGNED',
        state: PaymentState.PENDING,
      };
      mockPaymentRepo.findOne.mockResolvedValue(payment);
      mockOrderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        merchantId: 'merch-1',
        status: 'CREATED',
      });

      const result = await service.findByOrderId('order-1');

      expect(mockPaymentRepo.findOne).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
      });
      expect(result.paymentId).toBe('pay-1');
      expect(result.state).toBe(PaymentState.PENDING);
      expect(result.merchantSignature).toBe('0xPRESIGNED');
      expect(result.payload.merchant).toBe(payment.merchantAddress);
      expect(result.payload.customer).toBe(payment.customerAddress);
      expect(result.payload.token).toBe(payment.tokenAddress);
      expect(result.payload.amount).toBe('50000000'); // 50 USDT × 1e6
      expect(result.payload.deadline).toBe(farFutureDeadline);
      expect(result.order.id).toBe('order-1');
      expect(result.order.merchantId).toBe('merch-1');
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
