'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { MetricsData } from './metrics-types';

interface Props {
  gasReport: MetricsData['gasReport'];
}

// Formats large gas numbers with commas for readability
function fmtGas(n: number): string {
  return n.toLocaleString();
}

export function MetricsGasCosts({ gasReport }: Props) {
  if (!gasReport) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Gas Costs</h2>
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-6 text-center">
          <p className="text-sm text-gray-500">No gas report data available.</p>
          <p className="mt-1 text-xs text-gray-400 font-mono bg-gray-50 inline-block px-3 py-1 rounded mt-2">
            pnpm measure-gas
          </p>
          <p className="text-xs text-gray-400 mt-1">Run the above command to generate gas data.</p>
        </div>
      </section>
    );
  }

  // Recharts expects { name, min, avg, max } per bar group
  const chartData = gasReport.results.map((r) => ({
    name: r.operation.replace(/([A-Z])/g, ' $1').trim(), // camelCase → spaced label
    Min: r.min,
    Avg: r.avg,
    Max: r.max,
    samples: r.samples,
  }));

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Gas Costs</h2>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <p className="text-sm font-medium text-gray-600 mb-3">Gas Units per Operation (min / avg / max)</p>
        <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 60)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 4, left: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 11 }}
            />
            <Tooltip formatter={(value) => [typeof value === 'number' ? fmtGas(value) : value, 'gas units']} />
            <Legend />
            <Bar dataKey="Min" fill="#93c5fd" radius={[0, 3, 3, 0]} />
            <Bar dataKey="Avg" fill="#3b82f6" radius={[0, 3, 3, 0]} />
            <Bar dataKey="Max" fill="#1d4ed8" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabular breakdown for precise numbers */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2">Operation</th>
              <th className="px-4 py-2 text-right">Min</th>
              <th className="px-4 py-2 text-right">Avg</th>
              <th className="px-4 py-2 text-right">Max</th>
              <th className="px-4 py-2 text-right">Samples</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gasReport.results.map((r) => (
              <tr key={r.operation} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.operation}</td>
                <td className="px-4 py-2 text-right text-gray-600">{fmtGas(r.min)}</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-900">{fmtGas(r.avg)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{fmtGas(r.max)}</td>
                <td className="px-4 py-2 text-right text-gray-400">{r.samples}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
