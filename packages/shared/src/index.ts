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
  merchant: string;   // address
  customer: string;   // address
  amount: string;     // uint256 as decimal string
  orderId: string;    // bytes32 hex
  nonce: string;      // bytes32 hex
  deadline: number;   // unix timestamp
  token: string;      // ERC-20 address
}

// ---------------------------------------------------------------------------
// ABI Arrays — match compiled artifacts exactly
// ---------------------------------------------------------------------------

/** EscrowManager — events + functions the backend needs */
export const ESCROW_ABI = [
  // Events (matching compiled EscrowManager.sol)
  'event EscrowCreated(bytes32 indexed orderId, address indexed merchant, address indexed customer, uint256 amount, address token)',
  'event EscrowLocked(bytes32 indexed orderId, uint256 lockedAt, uint256 autoReleaseAt)',
  'event EscrowReleased(bytes32 indexed orderId, uint256 sellerAmount, uint256 platformFee)',
  'event EscrowAutoReleased(bytes32 indexed orderId)',
  'event EscrowDisputed(bytes32 indexed orderId, address initiator)',
  'event EscrowRefunded(bytes32 indexed orderId, uint256 customerAmount)',
  'event EscrowPartialRefund(bytes32 indexed orderId, uint256 customerAmount, uint256 sellerAmount)',
  'event DeliveryConfirmed(bytes32 indexed orderId, address confirmedBy)',

  // Functions
  'function lockEscrow(tuple(address merchant, address customer, uint256 amount, bytes32 orderId, bytes32 nonce, uint256 deadline, address token) payload, bytes merchantSignature) external',
  'function confirmDelivery(bytes32 orderId) external',
  'function triggerAutoRelease(bytes32 orderId) external',
  'function openDispute(bytes32 orderId) external',
  'function executeDisputeRuling(bytes32 orderId, uint256 sellerBasisPoints) external',
];

/** DisputeResolution — matching compiled DisputeResolution.sol */
export const DISPUTE_ABI = [
  // Events
  'event DisputeOpened(bytes32 indexed orderId, address initiator)',
  'event EvidenceSubmitted(bytes32 indexed orderId, address submitter, string ipfsHash)',
  'event ArbiterVoted(bytes32 indexed orderId, address arbiter, uint8 vote)',
  'event DisputeResolved(bytes32 indexed orderId, uint256 sellerBasisPoints, bool isFinal)',
  'event DisputeAppealed(bytes32 indexed orderId)',
  'event DisputeFinalized(bytes32 indexed orderId, uint256 sellerBasisPoints)',

  // Functions
  'function createDispute(bytes32 orderId, address initiator) external',
  'function submitEvidence(bytes32 orderId, string calldata ipfsHash) external',
  'function startVoting(bytes32 orderId) external',
  'function castVote(bytes32 orderId, uint8 vote, uint256 sellerBasisPoints) external',
  'function appeal(bytes32 orderId) external',
  'function finalize(bytes32 orderId) external',
];

/** LogisticsOracle — matching compiled LogisticsOracle.sol */
export const ORACLE_ABI = [
  // Events
  'event ProviderConfirmed(bytes32 indexed orderId, address provider, string trackingCode)',
  'event ConsensusReached(bytes32 indexed orderId, uint256 confirmedAt)',

  // Functions
  'function confirmDelivery(bytes32 orderId, string calldata trackingCode) external',
];

/** SettlementContract — matching compiled SettlementContract.sol */
export const SETTLEMENT_ABI = [
  // Events
  'event BatchCommitted(uint256 indexed batchId, bytes32 merkleRoot, uint256 txCount)',

  // Functions
  'function commitBatch(bytes32 merkleRoot, uint256 txCount, string calldata ipfsHash) external returns (uint256 batchId)',
  'function verifyTransaction(uint256 batchId, bytes32 txHash, bytes32[] calldata proof) external view returns (bool)',
  'function getBatchCount() external view returns (uint256)',
];

/** Minimal ERC-20 ABI */
export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];
