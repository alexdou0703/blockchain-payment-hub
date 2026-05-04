import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '@payment-hub/shared';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  /** Create a new order with CREATED status */
  async create(dto: CreateOrderDto): Promise<Order> {
    const order = this.orderRepo.create({
      ...dto,
      status: OrderStatus.CREATED,
    });
    return this.orderRepo.save(order);
  }

  /** Find order by primary key or throw 404 */
  async findById(id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  /** Update order status field */
  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    const order = await this.findById(id);
    order.status = status;
    return this.orderRepo.save(order);
  }

  /** List orders filtered by merchantId and optional status */
  async findByMerchant(merchantId: string, status?: OrderStatus): Promise<Order[]> {
    const where: Record<string, unknown> = { merchantId };
    if (status) {
      // Guard against invalid enum values (e.g. PaymentState values sent by mistake)
      if (!Object.values(OrderStatus).includes(status)) return [];
      where['status'] = status;
    }
    return this.orderRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Called by EventListenerService when DeliveryConfirmed fires on-chain */
  async markDelivered(onChainOrderId: string): Promise<void> {
    await this.orderRepo.update(
      { onChainOrderId },
      { status: OrderStatus.DELIVERED },
    );
  }
}
