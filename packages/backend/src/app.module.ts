import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration from './config/configuration';
import { BlockchainModule } from './blockchain/blockchain.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { DisputesModule } from './disputes/disputes.module';
import { OracleModule } from './oracle/oracle.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettlementModule } from './settlement/settlement.module';
import { FiatModule } from './fiat/fiat.module';

@Module({
  imports: [
    // Global config — available everywhere via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Database — synchronize:true for development convenience
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        autoLoadEntities: true,
        synchronize: true,
        logging: process.env.NODE_ENV !== 'production',
      }),
    }),

    // Redis-backed job queues — parse URL into ioredis connection object
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(
          config.get<string>('redis.url') || 'redis://localhost:6379',
        );
        return {
          redis: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379', 10),
            password: redisUrl.password || undefined,
          },
        };
      },
    }),

    // Application-level event bus
    EventEmitterModule.forRoot(),

    // Feature modules
    BlockchainModule,
    OrdersModule,
    PaymentsModule,
    DisputesModule,
    OracleModule,
    NotificationsModule,
    SettlementModule,
    FiatModule,
  ],
})
export class AppModule {}
