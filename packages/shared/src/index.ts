// Shared types, enums, ABI arrays, and constants for the Payment Hub

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum OrderStatus {
  CREATED = 'CREATED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  LOCKED = 'LOCKED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentState {
  PENDING = 'PENDING',
  LOCKED = 'LOCKED',
  RELEASED = 'RELEASED',
  AUTO_RELEASED = 'AUTO_RELEASED',
  DISPUTED = 'DISPUTED',
  REFUNDED = 'REFUNDED',
  PARTIAL_REFUND = 'PARTIAL_REFUND',
}

export enum DisputeState {
  OPEN = 'OPEN',
  VOTING = 'VOTING',
  RESOLVED = 'RESOLVED',
  APPEALED = 'APPEALED',
  FINAL = 'FINAL',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Mirrors the Solidity PaymentPayload struct */
export interface PaymentPayload {
  merchant: string;
  customer: string;
  amount: string;
  orderId: string;
  nonce: string;
  deadline: number;
  token: string;
}

// ---------------------------------------------------------------------------
// ABI Arrays — JSON format required by Wagmi v2 / viem
// ---------------------------------------------------------------------------

export const ESCROW_ABI = [
  { type: 'event', name: 'EscrowCreated',     anonymous: false, inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }, { name: 'merchant', type: 'address', indexed: true  }, { name: 'customer', type: 'address', indexed: true  }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'token', type: 'address', indexed: false }] },
  { type: 'event', name: 'EscrowLocked',      anonymous: false, inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }, { name: 'lockedAt', type: 'uint256', indexed: false }, { name: 'autoReleaseAt', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'EscrowReleased',    anonymous: false, inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }, { name: 'sellerAmount', type: 'uint256', indexed: false }, { name: 'platformFee', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'EscrowAutoReleased',anonymous: false, inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }] },
  { type: 'event', name: 'EscrowDisputed',    anonymous: false, inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }, { name: 'initiator', type: 'address', indexed: false }] },
  { type: 'event', name: 'EscrowRefunded',    anonymous: false, inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }, { name: 'customerAmount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'EscrowPartialRefund',anonymous: false,inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }, { name: 'customerAmount', type: 'uint256', indexed: false }, { name: 'sellerAmount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'DeliveryConfirmed', anonymous: false, inputs: [{ name: 'orderId',  type: 'bytes32',  indexed: true  }, { name: 'confirmedBy', type: 'address', indexed: false }] },
  {
    type: 'function', name: 'lockEscrow', stateMutability: 'nonpayable',
    inputs: [
      { name: 'payload', type: 'tuple', components: [
        { name: 'merchant',  type: 'address' },
        { name: 'customer',  type: 'address' },
        { name: 'amount',    type: 'uint256' },
        { name: 'orderId',   type: 'bytes32' },
        { name: 'nonce',     type: 'bytes32' },
        { name: 'deadline',  type: 'uint256' },
        { name: 'token',     type: 'address' },
      ]},
      { name: 'merchantSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'confirmDelivery',     stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'triggerAutoRelease',  stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'openDispute',         stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'executeDisputeRuling',stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'sellerBasisPoints', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'addAcceptedToken',    stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setOracleAggregator', stateMutability: 'nonpayable', inputs: [{ name: 'oracle', type: 'address' }], outputs: [] },
] as const;

export const DISPUTE_ABI = [
  { type: 'event', name: 'DisputeOpened',    anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }, { name: 'initiator', type: 'address', indexed: false }] },
  { type: 'event', name: 'EvidenceSubmitted',anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }, { name: 'submitter', type: 'address', indexed: false }, { name: 'ipfsHash', type: 'string', indexed: false }] },
  { type: 'event', name: 'ArbiterVoted',     anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }, { name: 'arbiter', type: 'address', indexed: false }, { name: 'vote', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'DisputeResolved',  anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }, { name: 'sellerBasisPoints', type: 'uint256', indexed: false }, { name: 'isFinal', type: 'bool', indexed: false }] },
  { type: 'event', name: 'DisputeAppealed',  anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }] },
  { type: 'event', name: 'DisputeFinalized', anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }, { name: 'sellerBasisPoints', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'createDispute',  stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'initiator', type: 'address' }], outputs: [] },
  { type: 'function', name: 'submitEvidence', stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'ipfsHash', type: 'string' }], outputs: [] },
  { type: 'function', name: 'startVoting',    stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'castVote',       stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'vote', type: 'uint8' }, { name: 'sellerBasisPoints', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'appeal',         stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'finalize',       stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }], outputs: [] },
] as const;

export const ORACLE_ABI = [
  { type: 'event', name: 'ProviderConfirmed', anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }, { name: 'provider', type: 'address', indexed: false }, { name: 'trackingCode', type: 'string', indexed: false }] },
  { type: 'event', name: 'ConsensusReached',  anonymous: false, inputs: [{ name: 'orderId', type: 'bytes32', indexed: true }, { name: 'confirmedAt', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'confirmDelivery', stateMutability: 'nonpayable', inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'trackingCode', type: 'string' }], outputs: [] },
] as const;

export const SETTLEMENT_ABI = [
  { type: 'event', name: 'BatchCommitted', anonymous: false, inputs: [{ name: 'batchId', type: 'uint256', indexed: true }, { name: 'merkleRoot', type: 'bytes32', indexed: false }, { name: 'txCount', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'commitBatch',       stateMutability: 'nonpayable', inputs: [{ name: 'merkleRoot', type: 'bytes32' }, { name: 'txCount', type: 'uint256' }, { name: 'ipfsHash', type: 'string' }], outputs: [{ name: 'batchId', type: 'uint256' }] },
  { type: 'function', name: 'verifyTransaction', stateMutability: 'view',       inputs: [{ name: 'batchId', type: 'uint256' }, { name: 'txHash', type: 'bytes32' }, { name: 'proof', type: 'bytes32[]' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'getBatchCount',     stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const ERC20_ABI = [
  { type: 'function', name: 'approve',      stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'transfer',     stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'transferFrom', stateMutability: 'nonpayable', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'balanceOf',    stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance',    stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'decimals',     stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint8' }] },
] as const;
