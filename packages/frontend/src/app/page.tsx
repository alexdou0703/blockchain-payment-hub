import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">Blockchain Payment Hub</h1>
        <p className="mt-2 text-gray-500">Decentralised escrow for e-commerce</p>
      </div>
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <Link
          href="/checkout/demo-order-001"
          className="block text-center bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 px-6 rounded-lg transition"
        >
          Demo Checkout
        </Link>
        <Link
          href="/seller/dashboard"
          className="block text-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 rounded-lg transition"
        >
          Seller Dashboard
        </Link>
      </div>
    </main>
  );
}
