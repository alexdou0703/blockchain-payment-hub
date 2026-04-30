interface Props {
  locked: number;
  released: number;
  disputed: number;
}

export function EarningsSummary({ locked, released, disputed }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="Locked (Pending)" value={`${locked} USDT`} color="text-blue-600" />
      <StatCard label="Released" value={`${released} USDT`} color="text-brand-600" />
      <StatCard label="In Dispute" value={`${disputed} USDT`} color="text-red-600" />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
