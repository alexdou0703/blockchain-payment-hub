'use client';

import { KpiCard } from './metrics-kpi-card';
import type { MetricsData } from './metrics-types';

interface Props {
  settlement: MetricsData['settlement'];
  generatedAt: string;
}

export function MetricsSettlement({ settlement, generatedAt }: Props) {
  // Format the ISO timestamp into a human-readable local string
  const formattedDate = new Date(generatedAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Settlement</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Settlement Batches"
          value={settlement.batchCount}
          highlight={settlement.batchCount > 0 ? 'green' : 'default'}
        />
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-gray-300 p-4 shadow-sm sm:col-span-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Updated</p>
          <p className="mt-1 text-sm font-semibold text-gray-700">{formattedDate}</p>
        </div>
      </div>
    </section>
  );
}
