import { Module } from '@nestjs/common';
import { OracleModule } from '../oracle/oracle.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [OracleModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
