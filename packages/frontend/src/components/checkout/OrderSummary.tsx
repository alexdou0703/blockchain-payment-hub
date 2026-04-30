interface Order { id: string; merchantId: string; amount: string; status: string; }

export function OrderSummary({ order }: { order: Order | undefined }) {
  if (!order) return <div className="animate-pulse h-24 bg-gray-200 rounded-lg" />;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Order ID</span>
        <span className="font-mono text-xs text-gray-700">{order.id}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Merchant</span>
        <span className="text-gray-700">{order.merchantId}</span>
      </div>
      <div className="flex justify-between font-semibold text-lg border-t pt-2 mt-2">
        <span>Total</span>
        <span className="text-brand-600">{order.amount} USDT</span>
      </div>
    </div>
  );
}
