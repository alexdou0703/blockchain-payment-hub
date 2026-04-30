import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentRequestService } from '../src/payments/payment-request.service';
import { Payment } from '../src/payments/entities/payment.entity';
import { Order } from '../src/orders/entities/order.entity';
import { PaymentState } from '@payment-hub/shared';
import { CreatePaymentRequestDto } from '../src/payments/dto/create-payment-request.dto';

/** Mock TypeORM repositories */
const mockPaymentRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockOrderRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'blockchain.usdtAddress') return '0xUSDTaddress1234567890123456789012345';
    return undefined;
  }),
};

describe('PaymentRequestService', () => {
  let service: PaymentRequestService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRequestService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PaymentRequestService>(PaymentRequestService);
  });

  // ---------------------------------------------------------------------------
  // generatePaymentRequest() — payload shape
  // ---------------------------------------------------------------------------
  describe('generatePaymentRequest()', () => {
    const dto: CreatePaymentRequestDto = {
      platformOrderId: 'order-abc-123',
      merchantAddress: '0xMerchant0000000000000000000000000000001',
      customerAddress: '0xCustomer0000000000000000000000000000001',
      amount: '50.00',
    } as CreatePaymentRequestDto;

    let builtPayment: Partial<Payment>;
    let savedPayment: Partial<Payment>;

    beforeEach(() => {
      // Capture what create() is called with so we can return it from save()
      mockPaymentRepo.create.mockImplementation((data) => {
        builtPayment = { ...data, id: 'pay-uuid-1' };
        return builtPayment;
      });
      mockPaymentRepo.save.mockImplementation((p) => {
        savedPayment = { ...p };
        return Promise.resolve(savedPayment);
      });
      mockOrderRepo.update.mockResolvedValue({ affected: 1 });
    });

    it('should return payload with correct bytes32 orderId (0x-prefixed, 66 chars)', async () => {
      const { payload } = await service.generatePaymentRequest(dto);

      expect(payload.orderId).toMatch(/^0x/);
      expect(payload.orderId.length).toBe(66); // '0x' + 64 hex chars
    });

    it('should return payload with bytes32 nonce (0x-prefixed, 66 chars)', async () => {
      const { payload } = await service.generatePaymentRequest(dto);

      expect(payload.nonce).toMatch(/^0x/);
      expect(payload.nonce.length).toBe(66);
    });

    it('should return a deadline approximately 30 minutes in the future', async () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const { payload } = await service.generatePaymentRequest(dto);

      const expectedDeadline = nowSecs + 1800;
      // Allow 2-second tolerance for test execution time
      expect(payload.deadline).toBeGreaterThanOrEqual(expectedDeadline - 2);
      expect(payload.deadline).toBeLessThanOrEqual(expectedDeadline + 2);
    });

    it('should return amount as a uint256-compatible string (USDT 6 decimals)', async () => {
      const { payload } = await service.generatePaymentRequest(dto);

      // '50.00' with 6 decimals = 50_000_000
      expect(payload.amount).toBe('50000000');
    });

    it('should save the payment record to the repository', async () => {
      await service.generatePaymentRequest(dto);

      expect(mockPaymentRepo.create).toHaveBeenCalledTimes(1);
      expect(mockPaymentRepo.save).toHaveBeenCalledTimes(1);

      // Verify the persisted payment has expected fields
      const createArgs = mockPaymentRepo.create.mock.calls[0][0];
      expect(createArgs.orderId).toBe(dto.platformOrderId);
      expect(createArgs.state).toBe(PaymentState.PENDING);
      expect(createArgs.merchantAddress).toBe(dto.merchantAddress);
      expect(createArgs.customerAddress).toBe(dto.customerAddress);
    });

    it('should call orderRepo.update to backfill onChainOrderId', async () => {
      const { payload } = await service.generatePaymentRequest(dto);

      expect(mockOrderRepo.update).toHaveBeenCalledWith(
        { id: dto.platformOrderId },
        { onChainOrderId: payload.orderId },
      );
    });

    it('should return a paymentId and the full payload object', async () => {
      const result = await service.generatePaymentRequest(dto);

      expect(result).toHaveProperty('paymentId');
      expect(typeof result.paymentId).toBe('string');
      expect(result).toHaveProperty('payload');
      expect(result.payload).toHaveProperty('merchant', dto.merchantAddress);
      expect(result.payload).toHaveProperty('customer', dto.customerAddress);
      expect(result.payload).toHaveProperty('token');
      expect(result.payload).toHaveProperty('orderId');
      expect(result.payload).toHaveProperty('nonce');
      expect(result.payload).toHaveProperty('deadline');
      expect(result.payload).toHaveProperty('amount');
    });
  });
});
