'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { PaymentStatusTracker } from '@/components/checkout/PaymentStatusTracker';

export default function SellerOrderPage({ params }: { params: { orderId: string } }) {
  const { orderId } = params;

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.getOrder(orderId),
  });

  const paymentStatus = usePaymentStatus(orderId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Order not found.
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/seller/dashboard" className="text-sm text-brand-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Order Details</h1>
        </div>

        <PaymentStatusTracker currentStatus={paymentStatus} />

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 text-sm">
          <Row label="Order ID" value={order.id} mono />
          <Row label="Customer" value={order.customerId} mono />
          <Row label="Amount" value={`${order.amount} USDT`} />
          <Row label="Status" value={order.status} />
          {order.onChainOrderId && <Row label="On-chain ID" value={order.onChainOrderId} mono />}
          <Row label="Created" value={new Date(order.createdAt).toLocaleString()} />
        </div>

        {order.status === 'DISPUTED' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            This order is under dispute. Check the{' '}
            <Link href={`/disputes/${orderId}`} className="underline font-medium">
              dispute page
            </Link>{' '}
            to submit counter-evidence.
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-800 ${mono ? 'font-mono text-xs truncate max-w-[220px]' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
