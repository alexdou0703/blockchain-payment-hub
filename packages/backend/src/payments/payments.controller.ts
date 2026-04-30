import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PaymentRequestService } from './payment-request.service';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';

@ApiTags('Payments')
@Controller('api/v1/payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentRequestService: PaymentRequestService,
  ) {}

  @Post('request')
  @ApiOperation({ summary: 'Generate a new payment request payload' })
  createPaymentRequest(@Body() dto: CreatePaymentRequestDto) {
    return this.paymentRequestService.generatePaymentRequest(dto);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get payment by platform order ID' })
  @ApiParam({ name: 'orderId', description: 'Platform order ID' })
  getPaymentByOrderId(@Param('orderId') orderId: string) {
    return this.paymentsService.findByOrderId(orderId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by payment ID' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  getPayment(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Store merchant signature for a payment request' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  confirmPaymentRequest(
    @Param('id') id: string,
    @Body() body: { merchantSignature: string },
  ) {
    return this.paymentsService.confirmSignature(id, body.merchantSignature);
  }
}
