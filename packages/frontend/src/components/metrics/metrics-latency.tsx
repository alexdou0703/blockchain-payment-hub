'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { KpiCard } from './metrics-kpi-card';
import type { MetricsData } from './metrics-types';

interface Props {
  payments: MetricsData['payments'];
}

// Formats milliseconds: displays as seconds if >= 1000 ms, otherwise as ms
function fmtDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

const PERCENTILE_COLORS = ['#86efac', '#22c55e', '#15803d'];

export function MetricsLatency({ payments }: Props) {
  const { avgLockToReleaseMs, p50LockToReleaseMs, p95LockToReleaseMs } = payments;

  const hasData =
    avgLockToReleaseMs !== null || p50LockToReleaseMs !== null || p95LockToReleaseMs !== null;

  // Chart data — only include buckets that have values
  const chartData = [
    { label: 'Avg', ms: avgLockToReleaseMs },
    { label: 'p50', ms: p50LockToReleaseMs },
    { label: 'p95', ms: p95LockToReleaseMs },
  ].filter((d) => d.ms !== null) as { label: string; ms: number }[];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Latency — Lock to Release</h2>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Avg"
          value={fmtDuration(avgLockToReleaseMs)}
          highlight={avgLockToReleaseMs !== null ? 'green' : 'default'}
        />
        <KpiCard
          label="p50 (Median)"
          value={fmtDuration(p50LockToReleaseMs)}
          highlight={p50LockToReleaseMs !== null ? 'green' : 'default'}
        />
        <KpiCard
          label="p95"
          value={fmtDuration(p95LockToReleaseMs)}
          highlight={p95LockToReleaseMs !== null ? 'yellow' : 'default'}
        />
      </div>

      {hasData && chartData.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <p className="text-sm font-medium text-gray-600 mb-3">Percentile Comparison (ms)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [
                  typeof value === 'number' ? fmtDuration(value) : value,
                  'Duration',
                ]}
              />
              <Bar dataKey="ms" radius={[4, 4, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={PERCENTILE_COLORS[index % PERCENTILE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-gray-400">No latency data available yet. Process some payments to populate this chart.</p>
      )}
    </section>
  );
}
