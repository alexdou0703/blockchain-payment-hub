'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { KpiCard } from './metrics-kpi-card';
import type { MetricsData } from './metrics-types';

// Consistent color palette for payment states
const STATE_COLORS: Record<string, string> = {
  LOCKED: '#3b82f6',
  RELEASED: '#22c55e',
  DISPUTED: '#f59e0b',
  REFUNDED: '#ef4444',
  CANCELLED: '#9ca3af',
};

const FALLBACK_COLORS = ['#6366f1', '#14b8a6', '#f43f5e', '#84cc16', '#8b5cf6'];

interface Props {
  payments: MetricsData['payments'];
}

export function MetricsPaymentOverview({ payments }: Props) {
  const { total, byState, totalVolumeUsdt } = payments;

  // Build pie chart data from byState record
  const pieData = Object.entries(byState).map(([name, value]) => ({ name, value }));

  const lockedCount = byState['LOCKED'] ?? 0;
  const releasedCount = byState['RELEASED'] ?? 0;

  const getColor = (state: string, index: number): string =>
    STATE_COLORS[state] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Payment Overview</h2>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Payments" value={total} highlight="default" />
        <KpiCard label="Total Volume" value={`${parseFloat(totalVolumeUsdt).toLocaleString()} USDT`} highlight="green" />
        <KpiCard label="Locked" value={lockedCount} highlight="yellow" />
        <KpiCard label="Released" value={releasedCount} highlight="green" />
      </div>

      {/* Payments by state donut chart */}
      {pieData.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <p className="text-sm font-medium text-gray-600 mb-3">Payments by State</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }: PieLabelRenderProps) =>
                  `${name ?? ''} ${(((percent as number | undefined) ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={getColor(entry.name, index)} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value, 'Count']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-gray-400">No payment state data available.</p>
      )}
    </section>
  );
}
