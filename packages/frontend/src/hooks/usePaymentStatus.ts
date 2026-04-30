'use client';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from '@/lib/constants';

export type PaymentStatusStep =
  | 'PENDING'
  | 'LOCKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'RELEASED'
  | 'AUTO_RELEASED'
  | 'DISPUTED'
  | 'REFUNDED';

export function usePaymentStatus(orderId: string | null) {
  const [status, setStatus] = useState<PaymentStatusStep>('PENDING');

  useEffect(() => {
    if (!orderId) return;
    const socket: Socket = io(WS_URL, { transports: ['websocket'] });
    socket.emit('subscribe', { orderId });
    socket.on('payment.status', (data: { orderId: string; status: PaymentStatusStep }) => {
      if (data.orderId === orderId) setStatus(data.status);
    });
    return () => { socket.disconnect(); };
  }, [orderId]);

  return status;
}
