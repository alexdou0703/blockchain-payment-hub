import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { ethers } from 'ethers';

import { OrdersController } from '../../src/orders/orders.controller';
import { OrdersService } from '../../src/orders/orders.service';
import { Order } from '../../src/orders/entities/order.entity';

import { PaymentsController } from '../../src/payments/payments.controller';
import { PaymentsService } from '../../src/payments/payments.service';
import { PaymentRequestService } from '../../src/payments/payment-request.service';
import { PaymentStateProcessor } from '../../src/payments/processors/payment-state.processor';
import { Payment } from '../../src/payments/entities/payment.entity';

import { SettlementController } from '../../src/settlement/settlement.controller';
import { SettlementService } from '../../src/settlement/settlement.service';
import { SettlementBatch } from '../../src/settlement/entities/settlement-batch.entity';
import { PinataService } from '../../src/settlement/pinata.service';

import { FiatController } from '../../src/fiat/fiat.controller';
import { FiatBridgeService } from '../../src/fiat/fiat-bridge.service';

import { EthersService } from '../../src/blockchain/ethers.service';
import { PaymentState, OrderStatus } from '@payment-hub/shared';

// ── Repo mocks ────────────────────────────────────────────────────────────────
const mockOrderRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockPaymentRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};

const mockBatchRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

// ── Service mocks ─────────────────────────────────────────────────────────────
const mockSettlementContract = {
  verifyTransaction: jest.fn().mockResolvedValue(true),
};

const mockSigner = {
  provider: { getNetwork: jest.fn().mockResolvedValue({ chainId: 11155111n }) },
  signTypedData: jest.fn().mockResolvedValue('0xSIG_FROM_E2E_STUB'),
};

const mockEthersService = {
  getSettlementContract: jest.fn().mockReturnValue(mockSettlementContract),
  getSigner: jest.fn().mockReturnValue(mockSigner),
  sendTransaction: jest.fn().mockResolvedValue({
    hash: '0xBatchTxE2E',
    logs: [{ topics: ['0xEvent', '0x5'] }],
  }),
};

const mockPinataService = {
  pinJSON: jest.fn().mockResolvedValue('QmE2EHash'),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'blockchain.usdtAddress') return '0x0000000000000000000000000000000000000001';
    return '';
  }),
};

describe('Payment Flow E2E', () => {
  let app: INestApplication;
  let fetchSpy: jest.SpyInstance;
  let fiatService: FiatBridgeService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [
        OrdersController,
        PaymentsController,
        SettlementController,
        FiatController,
      ],
      providers: [
        // Orders
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },

        // Payments
        PaymentsService,
        PaymentRequestService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: PaymentStateProcessor, useValue: {} }, // avoids QUEUE_NOT_FOUND

        // Settlement
        SettlementService,
        { provide: getRepositoryToken(SettlementBatch), useValue: mockBatchRepo },
        { provide: PinataService, useValue: mockPinataService },

        // Fiat
        FiatBridgeService,

        // Shared
        { provide: EthersService, useValue: mockEthersService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    fiatService = module.get<FiatBridgeService>(FiatBridgeService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
    // Re-apply defaults after clearAllMocks
    mockEthersService.getSettlementContract.mockReturnValue(mockSettlementContract);
    mockEthersService.sendTransaction.mockResolvedValue({
      hash: '0xBatchTxE2E',
      logs: [{ topics: ['0xEvent', '0x5'] }],
    });
    mockPinataService.pinJSON.mockResolvedValue('QmE2EHash');
    mockSettlementContract.verifyTransaction.mockResolvedValue(true);
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'blockchain.usdtAddress') return '0x0000000000000000000000000000000000000001';
      return '';
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── 1. Create order ──────────────────────────────────────────────────────────
  it('POST /api/v1/orders → 201 with CREATED order', async () => {
    const builtOrder = { merchantId: 'merch-1', customerId: 'cust-1', amount: '100.000000', status: OrderStatus.CREATED };
    const savedOrder = { id: 'order-uuid-1', ...builtOrder, createdAt: new Date(), updatedAt: new Date() };

    mockOrderRepo.create.mockReturnValue(builtOrder);
    mockOrderRepo.save.mockResolvedValue(savedOrder);

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ merchantId: 'merch-1', customerId: 'cust-1', amount: '100.000000' })
      .expect(201);

    expect(res.body.id).toBe('order-uuid-1');
    expect(res.body.status).toBe(OrderStatus.CREATED);
  });

  // ── 2. Get order by ID ───────────────────────────────────────────────────────
  it('GET /api/v1/orders/:id → 200 with order data', async () => {
    const savedOrder = { id: 'order-uuid-1', merchantId: 'merch-1', status: OrderStatus.CREATED };
    mockOrderRepo.findOne.mockResolvedValue(savedOrder);

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders/order-uuid-1')
      .expect(200);

    expect(res.body.id).toBe('order-uuid-1');
  });

  // ── 3. Get order 404 ──────────────────────────────────────────────────────────
  it('GET /api/v1/orders/:id → 404 when order not found', async () => {
    mockOrderRepo.findOne.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/v1/orders/nonexistent')
      .expect(404);
  });

  // ── 4. Generate payment request ───────────────────────────────────────────────
  it('POST /api/v1/payments/request → 201 with paymentId and payload', async () => {
    // create() must return the object with id so paymentId = payment.id resolves
    const builtPayment = {
      id: 'pay-uuid-1',
      orderId: 'order-1',
      paymentRequestId: 'pr-uuid',
      merchantAddress: '0x1111111111111111111111111111111111111111',
      customerAddress: '0x2222222222222222222222222222222222222222',
      amount: '50.000000',
      state: PaymentState.PENDING,
    };

    mockPaymentRepo.create.mockReturnValue(builtPayment);
    mockPaymentRepo.save.mockResolvedValue(builtPayment);
    mockOrderRepo.update.mockResolvedValue({ affected: 1 });

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/request')
      .send({
        platformOrderId: 'order-1',
        merchantAddress: '0x1111111111111111111111111111111111111111',
        customerAddress: '0x2222222222222222222222222222222222222222',
        amount: '50.000000',
      })
      .expect(201);

    expect(res.body.paymentId).toBe('pay-uuid-1');
    expect(res.body.payload).toBeDefined();
    expect(res.body.payload.orderId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(res.body.payload.merchant).toBe('0x1111111111111111111111111111111111111111');
  });

  // ── 5. Get payment by order ───────────────────────────────────────────────────
  it('GET /api/v1/payments/order/:orderId → 200 with PENDING state', async () => {
    const farFutureDeadline = Math.floor(Date.now() / 1000) + 86_400;
    const savedPayment = {
      id: 'pay-uuid-1',
      orderId: 'order-1',
      merchantAddress: '0x1111111111111111111111111111111111111111',
      customerAddress: '0x2222222222222222222222222222222222222222',
      tokenAddress:    '0x0000000000000000000000000000000000000001',
      amount: '50.000000',
      nonce: '0x' + 'aa'.repeat(32),
      deadline: farFutureDeadline,
      merchantSignature: '0xPRESIGNED',
      state: PaymentState.PENDING,
    };
    mockPaymentRepo.findOne.mockResolvedValue(savedPayment);
    mockOrderRepo.findOne.mockResolvedValue({
      id: 'order-1',
      merchantId: 'merch-1',
      status: OrderStatus.CREATED,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/payments/order/order-1')
      .expect(200);

    expect(res.body.state).toBe(PaymentState.PENDING);
    expect(res.body.paymentId).toBe('pay-uuid-1');
    expect(res.body.merchantSignature).toBe('0xPRESIGNED');
  });

  // ── 6. Trigger batch settlement — 1 payment ───────────────────────────────────
  it('POST /api/v1/settlement/trigger → 201 with settled=1', async () => {
    const releasedPayment: Partial<Payment> = {
      id: 'pay-settled-1',
      chainTxHash: '0x' + 'ff'.repeat(32),
      merchantAddress: '0x1111111111111111111111111111111111111111',
      amount: '50.000000',
      state: PaymentState.RELEASED,
      settledInBatch: false,
      releasedAt: new Date(),
    };
    mockPaymentRepo.find.mockResolvedValue([releasedPayment]);

    const savedBatch = { id: 'batch-uuid-1' };
    mockBatchRepo.create.mockReturnValue(savedBatch);
    mockBatchRepo.save.mockResolvedValue(savedBatch);
    mockPaymentRepo.update.mockResolvedValue({ affected: 1 });

    const res = await request(app.getHttpServer())
      .post('/api/v1/settlement/trigger')
      .expect(201);

    expect(res.body.settled).toBe(1);
    expect(res.body.merkleRoot).toMatch(/^0x/);
    expect(res.body.ipfsHash).toBe('QmE2EHash');
  });

  // ── 7. Trigger batch settlement — empty ───────────────────────────────────────
  it('POST /api/v1/settlement/trigger → 201 with settled=0 when no payments', async () => {
    mockPaymentRepo.find.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .post('/api/v1/settlement/trigger')
      .expect(201);

    expect(res.body.settled).toBe(0);
    expect(res.body.merkleRoot).toBe(ethers.ZeroHash);
  });

  // ── 8. List settlement batches ────────────────────────────────────────────────
  it('GET /api/v1/settlement/batches → 200 with batch array', async () => {
    const batchFixture = { id: 'batch-1', merkleRoot: '0x' + '00'.repeat(32), txCount: 3 };
    mockBatchRepo.find.mockResolvedValue([batchFixture]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/settlement/batches')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('batch-1');
  });

  // ── 9. Fiat rate ──────────────────────────────────────────────────────────────
  it('GET /api/v1/fiat/rate → 200 with USDT/VND rate', async () => {
    // Spy on the service instance to bypass cache from prior tests
    jest.spyOn(fiatService, 'getRate').mockResolvedValueOnce(25_500);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiat/rate')
      .expect(200);

    expect(res.body.usdtVnd).toBe(25_500);
    expect(res.body.source).toBe('coingecko');
  });

  // ── 10. Fiat on-ramp ──────────────────────────────────────────────────────────
  it('POST /api/v1/fiat/on-ramp → 201 with USDT conversion', async () => {
    jest.spyOn(fiatService, 'getRate').mockResolvedValueOnce(25_000);

    const res = await request(app.getHttpServer())
      .post('/api/v1/fiat/on-ramp')
      .send({ customerId: 'cust-1', vndAmount: 250_000 })
      .expect(201);

    expect(res.body.usdtAmount).toBe(9.85);
    expect(res.body.fee).toBe(0.15);
    expect(res.body.exchangeRate).toBe(25_000);
  });

  // ── 11. Fiat off-ramp ─────────────────────────────────────────────────────────
  it('POST /api/v1/fiat/off-ramp → 201 with VND conversion', async () => {
    jest.spyOn(fiatService, 'getRate').mockResolvedValueOnce(25_000);

    const res = await request(app.getHttpServer())
      .post('/api/v1/fiat/off-ramp')
      .send({ merchantId: 'merch-1', usdtAmount: 10, bankAccount: '9704001234567890' })
      .expect(201);

    expect(res.body.vndAmount).toBe(247_500);
    expect(res.body.fee).toBe(2_500);
    expect(res.body.estimatedTime).toBe('30 minutes');
  });

  // ── 12. Validation rejection ──────────────────────────────────────────────────
  it('POST /api/v1/fiat/on-ramp with empty body → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/fiat/on-ramp')
      .send({})
      .expect(400);
  });

  it('POST /api/v1/payments/request with missing fields → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments/request')
      .send({ platformOrderId: 'order-1' }) // missing merchantAddress, customerAddress, amount
      .expect(400);
  });
});
