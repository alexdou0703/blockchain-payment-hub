'use client';
import { useState } from 'react';

interface Props {
  disputeId: string;
  // Accept Promise<unknown> so callers can pass mutateAsync directly without wrapping
  onSubmit: (ipfsHash: string) => Promise<unknown>;
}

export function EvidenceUpload({ disputeId: _disputeId, onSubmit }: Props) {
  const [ipfsHash, setIpfsHash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipfsHash.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(ipfsHash.trim());
      setIpfsHash('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        IPFS Evidence Hash
      </label>
      <input
        type="text"
        value={ipfsHash}
        onChange={(e) => setIpfsHash(e.target.value)}
        placeholder="Qm... or bafy..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
      />
      <p className="text-xs text-gray-400">
        Upload your evidence (photos, chat logs) to IPFS via Pinata, then paste the hash here.
      </p>
      <button
        type="submit"
        disabled={submitting || !ipfsHash.trim()}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition"
      >
        {submitting ? 'Submitting…' : 'Submit Evidence'}
      </button>
      {success && <p className="text-sm text-green-600">Evidence submitted.</p>}
    </form>
  );
}
