'use client';

// Reusable KPI card used across all metric sections
interface KpiCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  highlight?: 'green' | 'yellow' | 'red' | 'default';
}

export function KpiCard({ label, value, subValue, highlight = 'default' }: KpiCardProps) {
  const borderColor = {
    green: 'border-l-brand-500',
    yellow: 'border-l-yellow-400',
    red: 'border-l-red-400',
    default: 'border-l-gray-300',
  }[highlight];

  return (
    <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${borderColor} p-4 shadow-sm`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {subValue && <p className="mt-0.5 text-xs text-gray-400">{subValue}</p>}
    </div>
  );
}
