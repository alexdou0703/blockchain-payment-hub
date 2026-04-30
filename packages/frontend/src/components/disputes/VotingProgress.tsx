interface Props {
  state: string;
  evidenceHashes: string[];
  ruling: string | null;
  sellerBasisPoints: number | null;
}

export function VotingProgress({ state, evidenceHashes, ruling, sellerBasisPoints }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Dispute State</span>
        <DisputeStateBadge state={state} />
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          Evidence Submitted ({evidenceHashes.length})
        </p>
        {evidenceHashes.length === 0 ? (
          <p className="text-xs text-gray-400">No evidence yet.</p>
        ) : (
          <ul className="space-y-1">
            {evidenceHashes.map((h) => (
              <li key={h} className="text-xs font-mono text-gray-600 truncate">{h}</li>
            ))}
          </ul>
        )}
      </div>

      {ruling && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <p className="font-medium text-gray-700">Ruling: {ruling}</p>
          {sellerBasisPoints !== null && (
            <p className="text-gray-500 mt-1">
              Seller receives {(sellerBasisPoints / 100).toFixed(0)}% of escrow
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DisputeStateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    OPEN: 'bg-yellow-100 text-yellow-700',
    VOTING: 'bg-blue-100 text-blue-700',
    RESOLVED: 'bg-green-100 text-green-700',
    APPEALED: 'bg-orange-100 text-orange-700',
    FINAL: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[state] ?? 'bg-gray-100 text-gray-600'}`}>
      {state}
    </span>
  );
}
