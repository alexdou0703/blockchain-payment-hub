'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OrderCard } from '@/components/seller/OrderCard';
import { EarningsSummary } from '@/components/seller/EarningsSummary';

export default function SellerDashboard() {
  const merchantId = 'demo-merchant-001';

  const { data: lockedOrders = [] } = useQuery({
    queryKey: ['orders', 'LOCKED'],
    queryFn: () => api.getOrders({ merchantId, status: 'LOCKED' }),
  });

  const { data: shippedOrders = [] } = useQuery({
    queryKey: ['orders', 'SHIPPED'],
    queryFn: () => api.getOrders({ merchantId, status: 'SHIPPED' }),
  });

  const { data: disputedOrders = [] } = useQuery({
    queryKey: ['orders', 'DISPUTED'],
    queryFn: () => api.getOrders({ merchantId, status: 'DISPUTED' }),
  });

  const { data: releasedOrders = [] } = useQuery({
    queryKey: ['orders', 'COMPLETED'],
    queryFn: () => api.getOrders({ merchantId, status: 'COMPLETED' }),
  });

  const sum = (orders: typeof lockedOrders) =>
    orders.reduce((acc, o) => acc + parseFloat(o.amount), 0);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Seller Dashboard</h1>

        <EarningsSummary
          locked={sum(lockedOrders)}
          released={sum(releasedOrders)}
          disputed={sum(disputedOrders)}
        />

        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            Awaiting Shipment ({lockedOrders.length})
          </h2>
          <div className="space-y-3">
            {lockedOrders.map((o) => <OrderCard key={o.id} order={o} />)}
            {lockedOrders.length === 0 && <EmptyState label="No locked orders" />}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            In Transit ({shippedOrders.length})
          </h2>
          <div className="space-y-3">
            {shippedOrders.map((o) => <OrderCard key={o.id} order={o} />)}
            {shippedOrders.length === 0 && <EmptyState label="No orders in transit" />}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-red-600 mb-3">
            Disputed ({disputedOrders.length})
          </h2>
          <div className="space-y-3">
            {disputedOrders.map((o) => <OrderCard key={o.id} order={o} />)}
            {disputedOrders.length === 0 && <EmptyState label="No disputes" />}
          </div>
        </section>
      </div>
    </main>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-gray-400 py-4 text-center">{label}</p>;
}
