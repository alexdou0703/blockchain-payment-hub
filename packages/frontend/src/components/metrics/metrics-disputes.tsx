'use client';

import { KpiCard } from './metrics-kpi-card';
import type { MetricsData } from './metrics-types';

interface Props {
  disputes: MetricsData['disputes'];
}

// Formats ms durations: >=1000ms shown as seconds
function fmtDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

// Maps dispute states to highlight colours for the KPI cards
const STATE_HIGHLIGHT: Record<string, 'green' | 'yellow' | 'red' | 'default'> = {
  RESOLVED: 'green',
  OPEN: 'yellow',
  ESCALATED: 'red',
  APPEALED: 'yellow',
};

export function MetricsDisputes({ disputes }: Props) {
  const { total, byState, avgResolutionMs, p50ResolutionMs, p95ResolutionMs } = disputes;

  const stateEntries = Object.entries(byState);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Dispute Resolution</h2>

      {/* Total + per-state counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Disputes" value={total} highlight={total > 0 ? 'yellow' : 'default'} />
        {stateEntries.map(([state, count]) => (
          <KpiCard
            key={state}
            label={state}
            value={count}
            highlight={STATE_HIGHLIGHT[state] ?? 'default'}
          />
        ))}
        {stateEntries.length === 0 && (
          <div className="col-span-3 flex items-center">
            <p className="text-sm text-gray-400">No disputes recorded.</p>
          </div>
        )}
      </div>

      {/* Resolution time KPIs */}
      <div>
        <p className="text-sm font-medium text-gray-600 mb-2">Resolution Time</p>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Avg" value={fmtDuration(avgResolutionMs)} />
          <KpiCard label="p50 (Median)" value={fmtDuration(p50ResolutionMs)} />
          <KpiCard label="p95" value={fmtDuration(p95ResolutionMs)} highlight={p95ResolutionMs !== null ? 'yellow' : 'default'} />
        </div>
      </div>
    </section>
  );
}
