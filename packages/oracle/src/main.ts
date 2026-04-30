import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const doc = new DocumentBuilder()
    .setTitle('Payment Hub — Oracle Service')
    .setDescription('Logistics delivery webhook aggregator with 2-of-3 on-chain consensus')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, doc));

  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  console.log(`Oracle service running on port ${port}`);
}
bootstrap();
