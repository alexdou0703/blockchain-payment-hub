/**
 * Translate the messy error objects that wagmi/viem/MetaMask throw into
 * user-readable messages, with actionable hints (e.g. faucet links) where
 * possible. Anything we can't classify falls back to the raw `shortMessage`
 * if it exists, otherwise the original message.
 */
export const SEPOLIA_CHAIN_ID = 11_155_111;
export const SEPOLIA_FAUCET_URL = 'https://www.alchemy.com/faucets/ethereum-sepolia';
export const USDT_FAUCET_HINT =
  'Ask the project deployer to mint MockUSDT to your wallet (no public faucet — it is a test token).';

interface ViemLikeError {
  name?: string;
  message?: string;
  shortMessage?: string;
  details?: string;
  cause?: unknown;
  code?: number | string;
  data?: { message?: string };
}

function dig(e: unknown, depth = 0): ViemLikeError | null {
  if (!e || depth > 5) return null;
  if (typeof e !== 'object') return null;
  return e as ViemLikeError;
}

function collectMessages(e: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = e;
  let depth = 0;
  while (cur && depth < 6) {
    const obj = dig(cur, depth);
    if (!obj) break;
    if (obj.shortMessage) out.push(obj.shortMessage);
    if (obj.details)      out.push(obj.details);
    if (obj.message)      out.push(obj.message);
    if (obj.data?.message) out.push(obj.data.message);
    cur = obj.cause;
    depth += 1;
  }
  return out;
}

export interface FormattedError {
  /** One-line message safe to render in the UI */
  message: string;
  /** Optional secondary line — e.g. faucet URL or recovery hint */
  hint?: string;
  /** Identifier we can use in tests / metrics */
  code:
    | 'user_rejected'
    | 'wrong_network'
    | 'insufficient_eth'
    | 'insufficient_usdt'
    | 'insufficient_allowance'
    | 'deadline_expired'
    | 'nonce_used'
    | 'invalid_signature'
    | 'token_not_whitelisted'
    | 'rpc_error'
    | 'simulation_revert'
    | 'unknown';
}

export function formatOnchainError(e: unknown): FormattedError {
  const msgs = collectMessages(e).map((m) => m.toLowerCase());
  const blob = msgs.join(' | ');

  // 1. User cancelled in wallet
  if (
    blob.includes('user rejected') ||
    blob.includes('user denied') ||
    blob.includes('rejected the request') ||
    blob.includes('action_rejected')
  ) {
    return {
      code: 'user_rejected',
      message: 'You cancelled the transaction in your wallet.',
    };
  }

  // 2. Wrong network
  if (
    blob.includes('chain mismatch') ||
    blob.includes('chain not configured') ||
    blob.includes('wrong network') ||
    blob.includes('unsupported chain')
  ) {
    return {
      code: 'wrong_network',
      message: 'Your wallet is on the wrong network.',
      hint: 'Switch to Sepolia testnet in MetaMask.',
    };
  }

  // 3. Insufficient ETH for gas
  if (
    blob.includes('insufficient funds') ||
    blob.includes('insufficient balance for transfer') ||
    blob.includes('exceeds balance')
  ) {
    return {
      code: 'insufficient_eth',
      message: 'Not enough Sepolia ETH to pay for gas.',
      hint: `Get free Sepolia ETH at ${SEPOLIA_FAUCET_URL}`,
    };
  }

  // 4. Contract reverts — match what EscrowManager.sol throws
  if (blob.includes('insufficient allowance') || blob.includes('erc20: insufficient allowance')) {
    return {
      code: 'insufficient_allowance',
      message: 'USDT allowance is too low. Approve again and retry.',
    };
  }
  if (
    blob.includes('transfer amount exceeds balance') ||
    blob.includes('erc20: transfer amount exceeds balance')
  ) {
    return {
      code: 'insufficient_usdt',
      message: 'Not enough MockUSDT in your wallet to lock this escrow.',
      hint: USDT_FAUCET_HINT,
    };
  }
  if (blob.includes('deadline') && (blob.includes('expired') || blob.includes('passed'))) {
    return {
      code: 'deadline_expired',
      message: 'This payment request has expired. Refresh the page to get a fresh signature.',
    };
  }
  if (blob.includes('nonce') && (blob.includes('used') || blob.includes('already'))) {
    return {
      code: 'nonce_used',
      message: 'This payment request was already submitted on-chain.',
    };
  }
  if (blob.includes('invalid signature') || blob.includes('signature mismatch')) {
    return {
      code: 'invalid_signature',
      message: 'Merchant signature is invalid. Refresh to get a new one.',
    };
  }
  if (blob.includes('token not whitelisted') || blob.includes('!whitelisted')) {
    return {
      code: 'token_not_whitelisted',
      message: 'This token is not whitelisted in the escrow contract.',
    };
  }

  // 5. Generic RPC / simulation problems
  if (blob.includes('rpc') || blob.includes('network error') || blob.includes('fetch failed')) {
    return {
      code: 'rpc_error',
      message: 'Network error talking to Sepolia. Check your connection and try again.',
    };
  }

  // 6. simulateContract surfaced a revert with no recognized reason
  if (
    blob.includes('execution reverted') ||
    blob.includes('contractfunctionexecutionerror') ||
    blob.includes('reverted')
  ) {
    const first = collectMessages(e)[0] ?? 'Contract reverted with no reason.';
    return {
      code: 'simulation_revert',
      message: `Transaction would fail: ${first}`,
    };
  }

  // Fallback — surface the most specific message we found
  const first = collectMessages(e)[0];
  return {
    code: 'unknown',
    message: first ?? 'Transaction failed for an unknown reason.',
  };
}
