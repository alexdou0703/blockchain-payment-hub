import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { BlockchainModule } from './blockchain/blockchain.module';
import { OracleModule } from './oracle/oracle.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    BlockchainModule,
    OracleModule,
    WebhookModule,
  ],
})
export class AppModule {}
