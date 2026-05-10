'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';
import { ESCROW_ADDRESS, USDT_ADDRESS } from '@/lib/constants';
import { api, type PaymentRequestData } from '@/lib/api';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { PaymentStatusTracker } from '@/components/checkout/PaymentStatusTracker';
import { ESCROW_ABI, ERC20_ABI } from '@payment-hub/shared';
import {
  formatOnchainError,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_FAUCET_URL,
  USDT_FAUCET_HINT,
} from '@/lib/onchain-errors';

// parseUnits is re-exported for callers that build amount bigints inline.
void parseUnits;

export default function CheckoutPage({ params }: { params: { orderId: string } }) {
  const { orderId } = params;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [step, setStep] = useState<'idle' | 'approving' | 'locking' | 'done'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  // Always fetch the order — works without a wallet, drives the OrderSummary.
  const { data: order, isLoading: orderLoading, error: orderError } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.getOrder(orderId),
    retry: false,
  });

  // Payment request: tied to the connected wallet. The backend bakes
  // customerAddress into the EIP-712 signature, so the request must be
  // (re)issued whenever the connected wallet changes.
  const {
    data: paymentRequest,
    isLoading: paymentLoading,
    error: paymentError,
    refetch: refetchPayment,
  } = useQuery<PaymentRequestData | null>({
    queryKey: ['payment-for-customer', orderId, address ?? null],
    enabled: isConnected && !!address && !!order,
    retry: false,
    queryFn: async () => {
      if (!order || !address) return null;
      const merchantAddress = order.merchantId.startsWith('0x')
        ? order.merchantId
        : '0x160F267cEF249Ced05c30e32172E9420E8Ad1EC8';

      // Try to fetch any existing payment request for this order.
      try {
        const existing = await api.getPaymentByOrderId(orderId);
        const customerMatches =
          existing.payload.customer.toLowerCase() === address.toLowerCase();
        if (customerMatches) return existing;
        // Customer mismatch — fall through to create a fresh request bound
        // to the connected wallet.
      } catch {
        // 404 is expected when no payment request exists yet — fall through.
      }

      const created = await api.createPaymentRequest({
        platformOrderId: orderId,
        merchantAddress,
        customerAddress: address,
        amount: order.amount,
      });

      // The POST returns paymentId + payload but no merchantSignature/state/order
      // — refetch via GET so the UI gets the fully enriched response.
      return api.getPaymentByOrderId(orderId);
    },
  });

  const paymentStatus = usePaymentStatus(paymentRequest?.paymentId ?? null);

  const publicClient = usePublicClient();
  const { writeContractAsync: approveAsync } = useWriteContract();
  const { writeContractAsync: lockAsync } = useWriteContract();

  const { isLoading: waitingReceipt } = useWaitForTransactionReceipt({ hash: txHash });

  // Refresh the payment request when the connected wallet changes — guarantees
  // the EIP-712 signature is bound to the current msg.sender.
  useEffect(() => {
    if (isConnected && address) refetchPayment();
  }, [address, isConnected, refetchPayment]);

  const reportError = (e: unknown) => {
    const f = formatOnchainError(e);
    setError(f.message);
    setErrorHint(f.hint ?? null);
    setStep('idle');
    if (f.code === 'deadline_expired' || f.code === 'invalid_signature') {
      // The backend will refresh signature/deadline on the next read.
      refetchPayment();
    }
  };

  const handlePay = async () => {
    if (!paymentRequest) {
      setError('Payment request is still loading. Please wait a moment and try again.');
      return;
    }
    if (!address || !publicClient) {
      setError('Connect your wallet first.');
      return;
    }
    if (paymentRequest.payload.customer.toLowerCase() !== address.toLowerCase()) {
      setError('Payment was prepared for a different wallet. Refreshing…');
      refetchPayment();
      return;
    }

    setError(null);
    setErrorHint(null);

    try {
      // ── Pre-flight 1: chain ────────────────────────────────────────────────
      if (chainId !== SEPOLIA_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: SEPOLIA_CHAIN_ID });
        } catch (e) {
          throw new Error('Please switch your wallet to Sepolia testnet to continue.');
        }
      }

      const amount = BigInt(paymentRequest.payload.amount);

      // ── Pre-flight 2: USDT balance ─────────────────────────────────────────
      const usdtBal = (await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: [...ERC20_ABI] as const,
        functionName: 'balanceOf',
        args: [address],
      })) as bigint;
      if (usdtBal < amount) {
        setError(`Insufficient MockUSDT balance (need ${Number(amount) / 1e6}, have ${Number(usdtBal) / 1e6}).`);
        setErrorHint(USDT_FAUCET_HINT);
        return;
      }

      // ── Pre-flight 3: ETH for gas ──────────────────────────────────────────
      const ethBal = await publicClient.getBalance({ address });
      const minGasWei = BigInt('1000000000000000'); // 0.001 ETH
      if (ethBal < minGasWei) {
        setError('Not enough Sepolia ETH to pay for gas.');
        setErrorHint(`Get free Sepolia ETH at ${SEPOLIA_FAUCET_URL}`);
        return;
      }

      // ── Step 1: ERC20 approve ──────────────────────────────────────────────
      setStep('approving');
      const approveHash = await approveAsync({
        address: USDT_ADDRESS,
        abi: [...ERC20_ABI] as const,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, amount],
      });

      // safeTransferFrom inside lockEscrow reverts if allowance is 0 at the
      // time the lock tx is mined — wait for approve to confirm.
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // ── Step 2: lock escrow ────────────────────────────────────────────────
      setStep('locking');
      const p = paymentRequest.payload;
      const lockPayload = {
        merchant:  p.merchant  as `0x${string}`,
        customer:  p.customer  as `0x${string}`,
        amount:    BigInt(p.amount),
        orderId:   p.orderId   as `0x${string}`,
        nonce:     p.nonce     as `0x${string}`,
        deadline:  BigInt(p.deadline),
        token:     p.token     as `0x${string}`,
      };
      const lockSig = paymentRequest.merchantSignature as `0x${string}`;

      // Simulate first so a revert surfaces the actual contract reason
      // instead of viem's generic "gas limit too high" wrapper.
      await publicClient.simulateContract({
        address: ESCROW_ADDRESS,
        abi: [...ESCROW_ABI] as const,
        functionName: 'lockEscrow',
        args: [lockPayload, lockSig],
        account: address,
      });

      const hash = await lockAsync({
        address: ESCROW_ADDRESS,
        abi: [...ESCROW_ABI] as const,
        functionName: 'lockEscrow',
        args: [lockPayload, lockSig],
      });
      setTxHash(hash);

      // Wait for inclusion before flipping to "done" so users see truth.
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStep('done');
    } catch (e: unknown) {
      reportError(e);
    }
  };

  if (orderLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <main className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-md mx-auto space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Order not found</h1>
          <p className="text-gray-600">
            We couldn&apos;t find an order with id <code className="bg-gray-100 px-1 rounded">{orderId}</code>.
            Ask the merchant for a fresh checkout link, or create one from the seller dashboard.
          </p>
        </div>
      </main>
    );
  }

  const customerMismatch =
    !!paymentRequest &&
    !!address &&
    paymentRequest.payload.customer.toLowerCase() !== address.toLowerCase();
  const payButtonDisabled =
    step !== 'idle' || waitingReceipt || !paymentRequest || customerMismatch;
  const payButtonLabel = (() => {
    if (step === 'approving') return 'Approving USDT…';
    if (step === 'locking')   return 'Locking Escrow…';
    if (paymentLoading)       return 'Preparing payment…';
    if (!paymentRequest)      return 'Loading…';
    return `Pay ${order.amount} USDT`;
  })();

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Complete Your Payment</h1>

        <PaymentStatusTracker currentStatus={paymentStatus} />
        <OrderSummary order={paymentRequest?.order ?? {
          id: order.id,
          merchantId: order.merchantId,
          amount: order.amount,
          status: order.status,
        }} />

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
            disabled={payButtonDisabled}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            {payButtonLabel}
          </button>
        )}

        {paymentError && !paymentRequest && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            Could not prepare a payment request for this order. The merchant may need to enable on-chain payments for it.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
            <div>{error}</div>
            {errorHint && (
              <div className="text-xs text-red-600 break-all">{errorHint}</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
