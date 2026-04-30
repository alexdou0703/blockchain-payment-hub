import { Module } from '@nestjs/common';
import { FiatBridgeService } from './fiat-bridge.service';
import { FiatController } from './fiat.controller';

@Module({
  providers: [FiatBridgeService],
  controllers: [FiatController],
  exports: [FiatBridgeService],
})
export class FiatModule {}
