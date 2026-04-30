'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { EvidenceUpload } from '@/components/disputes/EvidenceUpload';
import { VotingProgress } from '@/components/disputes/VotingProgress';

export default function DisputePage({ params }: { params: { disputeId: string } }) {
  const { disputeId } = params;
  const qc = useQueryClient();

  const { data: dispute, isLoading } = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => api.getDispute(disputeId),
    refetchInterval: 15000,
  });

  const addEvidence = useMutation({
    mutationFn: (ipfsHash: string) => api.addEvidence(disputeId, ipfsHash),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispute', disputeId] }),
  });

  const appeal = useMutation({
    mutationFn: () => api.appealDispute(disputeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispute', disputeId] }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Dispute not found.
      </div>
    );
  }

  const canAppeal = dispute.state === 'RESOLVED';

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/seller/dashboard" className="text-sm text-brand-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Dispute</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Dispute ID</span>
            <span className="font-mono text-xs">{dispute.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Order ID</span>
            <span className="font-mono text-xs">{dispute.orderId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Opened by</span>
            <span className="font-mono text-xs truncate max-w-[200px]">{dispute.initiatorAddress}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <VotingProgress
            state={dispute.state}
            evidenceHashes={dispute.evidenceHashes ?? []}
            ruling={dispute.ruling}
            sellerBasisPoints={dispute.sellerBasisPoints}
          />
        </div>

        {dispute.state === 'OPEN' && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Submit Evidence</h2>
            <EvidenceUpload
              disputeId={disputeId}
              onSubmit={addEvidence.mutateAsync}
            />
          </div>
        )}

        {canAppeal && (
          <button
            onClick={() => appeal.mutate()}
            disabled={appeal.isPending}
            className="w-full border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold py-2 px-4 rounded-lg transition"
          >
            {appeal.isPending ? 'Submitting Appeal…' : 'Appeal Ruling'}
          </button>
        )}
      </div>
    </main>
  );
}
