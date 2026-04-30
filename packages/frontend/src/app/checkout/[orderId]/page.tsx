'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';
import { ESCROW_ADDRESS, USDT_ADDRESS } from '@/lib/constants';
import { api } from '@/lib/api';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { PaymentStatusTracker } from '@/components/checkout/PaymentStatusTracker';
import { ESCROW_ABI, ERC20_ABI } from '@payment-hub/shared';

// Suppress unused import warning — parseUnits is used when constructing bigint amounts
void parseUnits;

export default function CheckoutPage({ params }: { params: { orderId: string } }) {
  const { orderId } = params;
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<'idle' | 'approving' | 'locking' | 'done'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { data: paymentRequest, isLoading } = useQuery({
    queryKey: ['payment', orderId],
    queryFn: () => api.getPaymentByOrderId(orderId),
    retry: false,
  });

  const paymentStatus = usePaymentStatus(paymentRequest?.paymentId ?? null);

  const { writeContractAsync: approveAsync } = useWriteContract();
  const { writeContractAsync: lockAsync } = useWriteContract();

  const { isLoading: waitingReceipt } = useWaitForTransactionReceipt({ hash: txHash });

  const handlePay = async () => {
    if (!paymentRequest || !address) return;
    setError(null);
    try {
      setStep('approving');
      const amount = BigInt(paymentRequest.payload.amount);

      await approveAsync({
        address: USDT_ADDRESS,
        abi: [...ERC20_ABI] as const,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, amount],
      });

      setStep('locking');
      const hash = await lockAsync({
        address: ESCROW_ADDRESS,
        abi: [...ESCROW_ABI] as const,
        functionName: 'lockEscrow',
        args: [paymentRequest.payload, paymentRequest.merchantSignature],
      });
      setTxHash(hash);
      setStep('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
      setStep('idle');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Complete Your Payment</h1>

        <PaymentStatusTracker currentStatus={paymentStatus} />
        <OrderSummary order={paymentRequest?.order} />

        {!isConnected ? (
          <div className="flex justify-center">
            <ConnectButton label="Connect Wallet to Pay" />
          </div>
        ) : step === 'done' ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-700 font-semibold">Payment submitted!</p>
            {txHash && (
              <p className="text-xs text-gray-500 mt-1 break-all">Tx: {txHash}</p>
            )}
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={step !== 'idle' || waitingReceipt}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            {step === 'approving' && 'Approving USDT…'}
            {step === 'locking' && 'Locking Escrow…'}
            {step === 'idle' && `Pay ${paymentRequest?.order.amount ?? ''} USDT`}
          </button>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
