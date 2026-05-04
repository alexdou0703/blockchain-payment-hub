'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/constants';
import { MetricsPaymentOverview } from '@/components/metrics/metrics-payment-overview';
import { MetricsGasCosts } from '@/components/metrics/metrics-gas-costs';
import { MetricsLatency } from '@/components/metrics/metrics-latency';
import { MetricsDisputes } from '@/components/metrics/metrics-disputes';
import { MetricsSettlement } from '@/components/metrics/metrics-settlement';
import type { MetricsData } from '@/components/metrics/metrics-types';

// Loading skeleton shown while the metrics API call is in-flight
function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-5 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
          <div className="h-60 bg-gray-100 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function MetricsPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch metrics from the backend API
    fetch(`${API_URL}/api/v1/metrics`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json() as Promise<MetricsData>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Metrics Dashboard</h1>
            <p className="mt-1 text-gray-500 text-sm">
              Live analytics for the Blockchain Payment Hub
            </p>
          </div>
          <a
            href="/"
            className="text-sm text-brand-600 hover:text-brand-700 font-medium transition"
          >
            ← Home
          </a>
        </div>

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-center">
            <p className="text-red-700 font-semibold">Failed to load metrics</p>
            <p className="text-red-500 text-sm mt-1">{error}</p>
            <p className="text-gray-400 text-xs mt-2">
              Make sure the backend is running at{' '}
              <span className="font-mono">{API_URL}</span>
            </p>
          </div>
        )}

        {/* Dashboard sections — only rendered once data is available */}
        {data && (
          <>
            <div className="border-t border-gray-200 pt-6">
              <MetricsPaymentOverview payments={data.payments} />
            </div>

            <div className="border-t border-gray-200 pt-6">
              <MetricsGasCosts gasReport={data.gasReport} />
            </div>

            <div className="border-t border-gray-200 pt-6">
              <MetricsLatency payments={data.payments} />
            </div>

            <div className="border-t border-gray-200 pt-6">
              <MetricsDisputes disputes={data.disputes} />
            </div>

            <div className="border-t border-gray-200 pt-6">
              <MetricsSettlement
                settlement={data.settlement}
                generatedAt={data.generatedAt}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
