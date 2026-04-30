import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { OrdersService } from '../src/orders/orders.service';
import { Order } from '../src/orders/entities/order.entity';
import { OrderStatus } from '@payment-hub/shared';
import { CreateOrderDto } from '../src/orders/dto/create-order.dto';

/** Mock TypeORM repository — all methods are jest.fn() */
const mockOrderRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    // Reset all mock state before each test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------
  describe('create()', () => {
    it('should call repo.create with CREATED status and return the saved order', async () => {
      const dto: CreateOrderDto = {
        merchantId: 'merch-1',
        customerId: 'cust-1',
        amount: '100.00',
        merchantAddress: '0xMerchant',
        customerAddress: '0xCustomer',
      } as CreateOrderDto;

      const builtOrder = { ...dto, status: OrderStatus.CREATED };
      const savedOrder = { id: 'uuid-1', ...builtOrder };

      mockOrderRepo.create.mockReturnValue(builtOrder);
      mockOrderRepo.save.mockResolvedValue(savedOrder);

      const result = await service.create(dto);

      expect(mockOrderRepo.create).toHaveBeenCalledWith({
        ...dto,
        status: OrderStatus.CREATED,
      });
      expect(mockOrderRepo.save).toHaveBeenCalledWith(builtOrder);
      expect(result).toEqual(savedOrder);
    });
  });

  // ---------------------------------------------------------------------------
  // findById()
  // ---------------------------------------------------------------------------
  describe('findById()', () => {
    it('should throw NotFoundException when order does not exist', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('missing-id')).rejects.toThrow(
        'Order missing-id not found',
      );
    });

    it('should return the order when found', async () => {
      const order: Partial<Order> = {
        id: 'uuid-1',
        merchantId: 'merch-1',
        status: OrderStatus.CREATED,
      };
      mockOrderRepo.findOne.mockResolvedValue(order);

      const result = await service.findById('uuid-1');

      expect(mockOrderRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
      });
      expect(result).toEqual(order);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus()
  // ---------------------------------------------------------------------------
  describe('updateStatus()', () => {
    it('should find the order, update its status, and save', async () => {
      const order: Partial<Order> = {
        id: 'uuid-1',
        status: OrderStatus.CREATED,
      };
      const updatedOrder = { ...order, status: OrderStatus.SHIPPED };

      mockOrderRepo.findOne.mockResolvedValue(order);
      mockOrderRepo.save.mockResolvedValue(updatedOrder);

      const result = await service.updateStatus('uuid-1', OrderStatus.SHIPPED);

      expect(mockOrderRepo.save).toHaveBeenCalledWith({
        id: 'uuid-1',
        status: OrderStatus.SHIPPED,
      });
      expect(result).toEqual(updatedOrder);
    });
  });

  // ---------------------------------------------------------------------------
  // markDelivered()
  // ---------------------------------------------------------------------------
  describe('markDelivered()', () => {
    it('should call repo.update with DELIVERED status matching onChainOrderId', async () => {
      mockOrderRepo.update.mockResolvedValue({ affected: 1 });

      await service.markDelivered('0xdeadbeef');

      expect(mockOrderRepo.update).toHaveBeenCalledWith(
        { onChainOrderId: '0xdeadbeef' },
        { status: OrderStatus.DELIVERED },
      );
    });
  });
});
