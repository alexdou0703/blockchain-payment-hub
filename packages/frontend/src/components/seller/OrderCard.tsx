import Link from 'next/link';
import clsx from 'clsx';
import type { OrderData } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  LOCKED: 'bg-blue-100 text-blue-700',
  SHIPPED: 'bg-yellow-100 text-yellow-700',
  DELIVERED: 'bg-green-100 text-green-700',
  DISPUTED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
};

export function OrderCard({ order }: { order: OrderData }) {
  return (
    <Link href={`/seller/orders/${order.id}`} className="block">
      <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition space-y-2">
        <div className="flex justify-between items-start">
          <span className="font-mono text-xs text-gray-500 truncate max-w-[160px]">{order.id}</span>
          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600')}>
            {order.status}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Customer</span>
          <span className="font-mono text-xs text-gray-700 truncate max-w-[160px]">{order.customerId}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Amount</span>
          <span className="text-brand-600">{order.amount} USDT</span>
        </div>
        <div className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</div>
      </div>
    </Link>
  );
}
