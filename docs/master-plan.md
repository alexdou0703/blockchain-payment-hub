# CLAUDE CODE MASTER PLAN
# Blockchain Payment Hub — Decentralized E-Commerce Payment Gateway
# Version: 1.0 | Stack: Solidity + Node.js + Next.js | Target: Research Prototype

---

## SYSTEM CONTEXT (đọc trước khi bắt đầu)

Đây là hệ thống thanh toán phi tập trung cho sàn thương mại điện tử, gồm 4 lớp:
1. **E-Commerce Platform** — Frontend + API Gateway + Order/Checkout services
2. **Blockchain Payment Hub (L2)** — Smart contract orchestration, escrow, dispute, batch settlement
3. **Layer 1 Blockchain** — Ethereum Sepolia testnet (Escrow + Settlement contracts)
4. **External Systems** — Logistics oracle, Fiat on/off ramp, Notification, Reconciliation

Mục tiêu build: **Research prototype** phục vụ dissertation, deploy trên testnet, demo được full flow: checkout → escrow lock → delivery confirm → release/dispute.

---

## MONOREPO STRUCTURE (khởi tạo ngay từ đầu)

```
payment-hub/
├── packages/
│   ├── contracts/          # Solidity smart contracts (Hardhat)
│   ├── backend/            # Node.js API (NestJS)
│   ├── frontend/           # Next.js 14 customer + seller UI
│   ├── oracle/             # Logistics oracle service
│   └── shared/             # Shared types, ABIs, constants
├── scripts/                # Deploy, seed, test scripts
├── docs/                   # Architecture docs
├── .env.example
├── package.json            # Workspace root (pnpm workspaces)
└── turbo.json              # Turborepo config
```

---

# PHASE 1 — SMART CONTRACTS (Tuần 1–2)

## Mục tiêu Phase 1
Viết, test và deploy toàn bộ smart contracts lên Sepolia testnet. Đây là core của hệ thống — mọi business logic đều nằm ở đây.

## Bước 1.1 — Khởi tạo project contracts

```bash
# Trong packages/contracts/
npx hardhat init
# Chọn: TypeScript project
# Cài thêm:
npm install --save-dev @nomicfoundation/hardhat-toolbox @openzeppelin/contracts dotenv
npm install --save-dev hardhat-gas-reporter solidity-coverage @typechain/hardhat
```

Cấu hình `hardhat.config.ts`:
```typescript
networks: {
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY]
  },
  localhost: { url: "http://127.0.0.1:8545" }
},
gasReporter: { enabled: true, currency: "USD" }
```

## Bước 1.2 — Contract: NonceManager.sol

**Mục đích:** Chống replay attack và double-spend. Mỗi payment request có 1 nonce duy nhất gắn với merchant address.

**File:** `packages/contracts/contracts/core/NonceManager.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract NonceManager {
    // merchant => nonce counter
    mapping(address => uint256) private _nonces;
    // merchant => nonce => used
    mapping(address => mapping(bytes32 => bool)) private _usedNonces;

    event NonceUsed(address indexed merchant, bytes32 indexed nonce);

    function currentNonce(address merchant) external view returns (uint256) {
        return _nonces[merchant];
    }

    function isNonceUsed(address merchant, bytes32 nonce) external view returns (bool) {
        return _usedNonces[merchant][nonce];
    }

    function _validateAndUseNonce(address merchant, bytes32 nonce) internal {
        require(!_usedNonces[merchant][nonce], "NonceManager: nonce already used");
        _usedNonces[merchant][nonce] = true;
        _nonces[merchant]++;
        emit NonceUsed(merchant, nonce);
    }
}
```

## Bước 1.3 — Contract: SignatureVerifier.sol

**Mục đích:** Verify chữ ký ECDSA của merchant khi tạo payment request. Support cả EOA (ECDSA) và smart contract wallet (EIP-1271).

**File:** `packages/contracts/contracts/core/SignatureVerifier.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature)
        external view returns (bytes4 magicValue);
}

contract SignatureVerifier {
    using ECDSA for bytes32;

    bytes4 constant ERC1271_MAGIC = 0x1626ba7e;

    // Cấu trúc payment payload được merchant ký
    struct PaymentPayload {
        address merchant;
        address customer;
        uint256 amount;       // in USDT wei (6 decimals)
        bytes32 orderId;      // keccak256(platform_order_id)
        bytes32 nonce;        // unique per payment
        uint256 deadline;     // unix timestamp, payment expires after this
        address token;        // ERC20 token address (USDT/USDC)
    }

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "PaymentPayload(address merchant,address customer,uint256 amount,bytes32 orderId,bytes32 nonce,uint256 deadline,address token)"
    );

    function hashPayload(PaymentPayload calldata payload) public pure returns (bytes32) {
        return keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            payload.merchant,
            payload.customer,
            payload.amount,
            payload.orderId,
            payload.nonce,
            payload.deadline,
            payload.token
        ));
    }

    function _verifyMerchantSignature(
        PaymentPayload calldata payload,
        bytes calldata signature
    ) internal view returns (bool) {
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(hashPayload(payload));

        // Thử EOA signature trước
        address recovered = hash.recover(signature);
        if (recovered == payload.merchant) return true;

        // Fallback: EIP-1271 cho smart contract wallet
        try IERC1271(payload.merchant).isValidSignature(hash, signature) returns (bytes4 magic) {
            return magic == ERC1271_MAGIC;
        } catch {
            return false;
        }
    }
}
```

## Bước 1.4 — Contract: EscrowManager.sol (CORE CONTRACT)

**Mục đích:** Lock tiền của customer, giữ trong escrow cho đến khi có delivery confirmation hoặc dispute resolution.

**File:** `packages/contracts/contracts/core/EscrowManager.sol`

**State machine:**
```
CREATED → LOCKED → RELEASED (seller nhận tiền)
                 → AUTO_RELEASED (timeout 7 ngày sau delivery)
                 → DISPUTED → RELEASED / REFUNDED / PARTIAL_REFUND
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./NonceManager.sol";
import "./SignatureVerifier.sol";

contract EscrowManager is NonceManager, SignatureVerifier, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ===== ENUMS =====
    enum EscrowState {
        CREATED,        // Payment request generated, chưa lock tiền
        LOCKED,         // Tiền đã lock trong escrow
        RELEASED,       // Tiền đã release cho seller
        AUTO_RELEASED,  // Tự động release sau timeout
        DISPUTED,       // Đang trong quá trình dispute
        REFUNDED,       // Hoàn tiền cho customer
        PARTIAL_REFUND  // Hoàn một phần
    }

    // ===== STRUCTS =====
    struct Escrow {
        bytes32 orderId;
        address merchant;
        address customer;
        address token;
        uint256 amount;
        uint256 platformFeeRate;  // basis points, e.g. 250 = 2.5%
        EscrowState state;
        uint256 lockedAt;
        uint256 deliveredAt;      // 0 nếu chưa deliver
        uint256 autoReleaseAt;    // timestamp tự động release (lockedAt + deliveryWindow + confirmWindow)
        bool oracleConfirmed;
    }

    // ===== STATE =====
    mapping(bytes32 => Escrow) public escrows;       // orderId => Escrow
    mapping(bytes32 => bool) public orderExists;

    address public platformTreasury;
    address public disputeContract;                  // address của DisputeResolution contract
    address public oracleAggregator;

    uint256 public defaultPlatformFeeRate = 250;     // 2.5% in basis points
    uint256 public deliveryWindowSeconds = 3 days;   // thời gian giao hàng
    uint256 public confirmWindowSeconds = 7 days;    // thời gian buyer confirm sau khi nhận
    uint256 public disputeWindowSeconds = 7 days;    // thời gian mở dispute

    // Whitelist các token được chấp nhận (USDT, USDC)
    mapping(address => bool) public acceptedTokens;

    // ===== EVENTS =====
    event EscrowCreated(bytes32 indexed orderId, address indexed merchant, address indexed customer, uint256 amount, address token);
    event EscrowLocked(bytes32 indexed orderId, uint256 lockedAt, uint256 autoReleaseAt);
    event EscrowReleased(bytes32 indexed orderId, uint256 sellerAmount, uint256 platformFee);
    event EscrowAutoReleased(bytes32 indexed orderId);
    event EscrowDisputed(bytes32 indexed orderId, address initiator);
    event EscrowRefunded(bytes32 indexed orderId, uint256 customerAmount);
    event EscrowPartialRefund(bytes32 indexed orderId, uint256 customerAmount, uint256 sellerAmount);
    event DeliveryConfirmed(bytes32 indexed orderId, address confirmedBy);

    // ===== MODIFIERS =====
    modifier onlyDisputeContract() {
        require(msg.sender == disputeContract, "Escrow: only dispute contract");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracleAggregator, "Escrow: only oracle");
        _;
    }

    modifier escrowExists(bytes32 orderId) {
        require(orderExists[orderId], "Escrow: order not found");
        _;
    }

    modifier inState(bytes32 orderId, EscrowState expectedState) {
        require(escrows[orderId].state == expectedState, "Escrow: invalid state");
        _;
    }

    constructor(address _treasury, address _oracle) Ownable(msg.sender) {
        platformTreasury = _treasury;
        oracleAggregator = _oracle;
    }

    // ===== CORE FUNCTIONS =====

    /**
     * @notice Customer lock tiền vào escrow
     * @dev Merchant đã ký PaymentPayload off-chain, customer submit lên chain
     */
    function lockEscrow(
        PaymentPayload calldata payload,
        bytes calldata merchantSignature
    ) external nonReentrant {
        // Validate
        require(acceptedTokens[payload.token], "Escrow: token not accepted");
        require(block.timestamp <= payload.deadline, "Escrow: payment expired");
        require(!orderExists[payload.orderId], "Escrow: order already exists");
        require(payload.amount > 0, "Escrow: zero amount");
        require(msg.sender == payload.customer, "Escrow: not the customer");

        // Verify merchant signature
        require(_verifyMerchantSignature(payload, merchantSignature), "Escrow: invalid merchant signature");

        // Use nonce
        _validateAndUseNonce(payload.merchant, payload.nonce);

        // Tính toán thời gian
        uint256 lockedAt = block.timestamp;
        uint256 autoReleaseAt = lockedAt + deliveryWindowSeconds + confirmWindowSeconds;

        // Tạo escrow record
        escrows[payload.orderId] = Escrow({
            orderId: payload.orderId,
            merchant: payload.merchant,
            customer: payload.customer,
            token: payload.token,
            amount: payload.amount,
            platformFeeRate: defaultPlatformFeeRate,
            state: EscrowState.LOCKED,
            lockedAt: lockedAt,
            deliveredAt: 0,
            autoReleaseAt: autoReleaseAt,
            oracleConfirmed: false
        });
        orderExists[payload.orderId] = true;

        // Transfer token từ customer vào contract
        IERC20(payload.token).safeTransferFrom(msg.sender, address(this), payload.amount);

        emit EscrowCreated(payload.orderId, payload.merchant, payload.customer, payload.amount, payload.token);
        emit EscrowLocked(payload.orderId, lockedAt, autoReleaseAt);
    }

    /**
     * @notice Customer xác nhận đã nhận hàng, release tiền cho seller
     */
    function confirmDelivery(bytes32 orderId)
        external
        nonReentrant
        escrowExists(orderId)
        inState(orderId, EscrowState.LOCKED)
    {
        Escrow storage e = escrows[orderId];
        require(msg.sender == e.customer, "Escrow: only customer");
        _releaseToSeller(orderId, EscrowState.RELEASED);
        emit DeliveryConfirmed(orderId, msg.sender);
    }

    /**
     * @notice Oracle xác nhận giao hàng thành công (2-of-3 consensus)
     */
    function confirmDeliveryByOracle(bytes32 orderId)
        external
        nonReentrant
        onlyOracle
        escrowExists(orderId)
        inState(orderId, EscrowState.LOCKED)
    {
        Escrow storage e = escrows[orderId];
        e.deliveredAt = block.timestamp;
        e.oracleConfirmed = true;
        // Không release ngay — chờ buyer confirm hoặc auto-release sau confirmWindow
        emit DeliveryConfirmed(orderId, msg.sender);
    }

    /**
     * @notice Auto-release nếu đã quá thời gian confirmWindow mà buyer không phản hồi
     */
    function triggerAutoRelease(bytes32 orderId)
        external
        nonReentrant
        escrowExists(orderId)
        inState(orderId, EscrowState.LOCKED)
    {
        Escrow storage e = escrows[orderId];
        require(block.timestamp >= e.autoReleaseAt, "Escrow: too early for auto-release");
        _releaseToSeller(orderId, EscrowState.AUTO_RELEASED);
        emit EscrowAutoReleased(orderId);
    }

    /**
     * @notice Customer mở dispute (trong disputeWindow sau khi delivery)
     */
    function openDispute(bytes32 orderId)
        external
        nonReentrant
        escrowExists(orderId)
        inState(orderId, EscrowState.LOCKED)
    {
        Escrow storage e = escrows[orderId];
        require(msg.sender == e.customer, "Escrow: only customer");
        require(e.oracleConfirmed, "Escrow: delivery not confirmed yet");
        require(block.timestamp <= e.deliveredAt + disputeWindowSeconds, "Escrow: dispute window closed");

        e.state = EscrowState.DISPUTED;
        emit EscrowDisputed(orderId, msg.sender);
    }

    /**
     * @notice DisputeResolution contract gọi hàm này để thực thi phán quyết
     * @param sellerBasisPoints phần trăm seller nhận (0–10000)
     */
    function executeDisputeRuling(bytes32 orderId, uint256 sellerBasisPoints)
        external
        nonReentrant
        onlyDisputeContract
        escrowExists(orderId)
        inState(orderId, EscrowState.DISPUTED)
    {
        require(sellerBasisPoints <= 10000, "Escrow: invalid basis points");
        Escrow storage e = escrows[orderId];

        if (sellerBasisPoints == 10000) {
            _releaseToSeller(orderId, EscrowState.RELEASED);
        } else if (sellerBasisPoints == 0) {
            _refundToCustomer(orderId);
        } else {
            _partialRelease(orderId, sellerBasisPoints);
        }
    }

    // ===== INTERNAL HELPERS =====

    function _releaseToSeller(bytes32 orderId, EscrowState newState) internal {
        Escrow storage e = escrows[orderId];
        e.state = newState;

        uint256 fee = (e.amount * e.platformFeeRate) / 10000;
        uint256 sellerAmount = e.amount - fee;

        IERC20(e.token).safeTransfer(e.merchant, sellerAmount);
        if (fee > 0) IERC20(e.token).safeTransfer(platformTreasury, fee);

        emit EscrowReleased(orderId, sellerAmount, fee);
    }

    function _refundToCustomer(bytes32 orderId) internal {
        Escrow storage e = escrows[orderId];
        e.state = EscrowState.REFUNDED;
        IERC20(e.token).safeTransfer(e.customer, e.amount);
        emit EscrowRefunded(orderId, e.amount);
    }

    function _partialRelease(bytes32 orderId, uint256 sellerBasisPoints) internal {
        Escrow storage e = escrows[orderId];
        e.state = EscrowState.PARTIAL_REFUND;

        uint256 sellerGross = (e.amount * sellerBasisPoints) / 10000;
        uint256 customerAmount = e.amount - sellerGross;
        uint256 fee = (sellerGross * e.platformFeeRate) / 10000;
        uint256 sellerNet = sellerGross - fee;

        IERC20(e.token).safeTransfer(e.merchant, sellerNet);
        IERC20(e.token).safeTransfer(e.customer, customerAmount);
        if (fee > 0) IERC20(e.token).safeTransfer(platformTreasury, fee);

        emit EscrowPartialRefund(orderId, customerAmount, sellerNet);
    }

    // ===== ADMIN =====
    function addAcceptedToken(address token) external onlyOwner { acceptedTokens[token] = true; }
    function removeAcceptedToken(address token) external onlyOwner { acceptedTokens[token] = false; }
    function setDisputeContract(address _dispute) external onlyOwner { disputeContract = _dispute; }
    function setOracleAggregator(address _oracle) external onlyOwner { oracleAggregator = _oracle; }
    function setPlatformTreasury(address _treasury) external onlyOwner { platformTreasury = _treasury; }
    function setFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= 1000, "Escrow: fee too high"); // max 10%
        defaultPlatformFeeRate = _feeRate;
    }
}
```

## Bước 1.5 — Contract: DisputeResolution.sol

**Mục đích:** Quản lý quy trình dispute với 2-of-3 arbiter multisig.

**File:** `packages/contracts/contracts/modules/DisputeResolution.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/EscrowManager.sol";

contract DisputeResolution is Ownable {

    struct Dispute {
        bytes32 orderId;
        address initiator;          // buyer mở dispute
        uint256 openedAt;
        uint256 evidenceDeadline;   // 72h để submit evidence
        uint256 votingDeadline;     // 24-48h để arbiter vote
        uint256 appealDeadline;     // 48h để appeal
        DisputeState state;
        uint256 yesVotes;           // votes release to seller
        uint256 noVotes;            // votes refund to customer
        mapping(address => bool) hasVoted;
        mapping(address => uint8) vote;  // 1=release, 2=refund
        uint256 sellerBasisPoints;  // kết quả cuối
        bool appealed;
    }

    enum DisputeState {
        OPEN,           // Đang trong evidence window
        VOTING,         // Arbiter đang vote
        RESOLVED,       // Đã có kết quả
        APPEALED,       // Đang appeal
        FINAL           // Kết quả cuối không thể thay đổi
    }

    EscrowManager public escrowManager;

    address[3] public arbiters;     // 3 arbiter cố định (có thể upgrade sau)
    uint256 public evidenceWindow = 72 hours;
    uint256 public votingWindow = 48 hours;
    uint256 public appealWindow = 48 hours;

    mapping(bytes32 => Dispute) public disputes;
    mapping(bytes32 => string[]) public evidenceHashes;  // IPFS hashes

    event DisputeOpened(bytes32 indexed orderId, address initiator);
    event EvidenceSubmitted(bytes32 indexed orderId, address submitter, string ipfsHash);
    event ArbiterVoted(bytes32 indexed orderId, address arbiter, uint8 vote);
    event DisputeResolved(bytes32 indexed orderId, uint256 sellerBasisPoints);
    event DisputeAppealed(bytes32 indexed orderId);

    modifier onlyArbiter() {
        bool isArbiter = false;
        for (uint i = 0; i < 3; i++) {
            if (arbiters[i] == msg.sender) { isArbiter = true; break; }
        }
        require(isArbiter, "Dispute: not an arbiter");
        _;
    }

    constructor(address _escrowManager, address[3] memory _arbiters) Ownable(msg.sender) {
        escrowManager = EscrowManager(_escrowManager);
        arbiters = _arbiters;
    }

    function submitEvidence(bytes32 orderId, string calldata ipfsHash) external {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.OPEN, "Dispute: not in evidence phase");
        require(block.timestamp <= d.evidenceDeadline, "Dispute: evidence window closed");
        evidenceHashes[orderId].push(ipfsHash);
        emit EvidenceSubmitted(orderId, msg.sender, ipfsHash);
    }

    function startVoting(bytes32 orderId) external {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.OPEN, "Dispute: not open");
        require(block.timestamp > d.evidenceDeadline, "Dispute: evidence window still open");
        d.state = DisputeState.VOTING;
        d.votingDeadline = block.timestamp + votingWindow;
    }

    /**
     * @param vote 1 = release to seller, 2 = refund to customer
     * @param sellerBasisPoints nếu partial: 0–10000
     */
    function castVote(bytes32 orderId, uint8 vote, uint256 sellerBasisPoints) external onlyArbiter {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.VOTING, "Dispute: not in voting phase");
        require(!d.hasVoted[msg.sender], "Dispute: already voted");
        require(vote == 1 || vote == 2, "Dispute: invalid vote");

        d.hasVoted[msg.sender] = true;
        d.vote[msg.sender] = vote;

        if (vote == 1) d.yesVotes++;
        else d.noVotes++;

        emit ArbiterVoted(orderId, msg.sender, vote);

        // 2-of-3: nếu đủ quorum thì resolve ngay
        if (d.yesVotes >= 2) {
            _resolve(orderId, sellerBasisPoints > 0 ? sellerBasisPoints : 10000);
        } else if (d.noVotes >= 2) {
            _resolve(orderId, 0);
        }
    }

    function appeal(bytes32 orderId) external {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.RESOLVED, "Dispute: not resolved");
        require(!d.appealed, "Dispute: already appealed");
        require(block.timestamp <= d.appealDeadline, "Dispute: appeal window closed");

        Escrow storage e = escrowManager.escrows(orderId);
        require(msg.sender == e.customer || msg.sender == e.merchant, "Dispute: not a party");

        d.appealed = true;
        d.state = DisputeState.APPEALED;
        // Reset voting cho round 2
        d.yesVotes = 0;
        d.noVotes = 0;
        d.votingDeadline = block.timestamp + votingWindow;
        emit DisputeAppealed(orderId);
    }

    function _resolve(bytes32 orderId, uint256 sellerBasisPoints) internal {
        Dispute storage d = disputes[orderId];
        d.state = d.appealed ? DisputeState.FINAL : DisputeState.RESOLVED;
        d.sellerBasisPoints = sellerBasisPoints;
        d.appealDeadline = block.timestamp + appealWindow;

        // Gọi EscrowManager thực thi
        escrowManager.executeDisputeRuling(orderId, sellerBasisPoints);
        emit DisputeResolved(orderId, sellerBasisPoints);
    }
}
```

## Bước 1.6 — Contract: LogisticsOracle.sol

**Mục đích:** Aggregator nhận delivery confirmation từ 2-of-3 logistics providers (GHN, GHTK, Viettel Post).

**File:** `packages/contracts/contracts/oracle/LogisticsOracle.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/EscrowManager.sol";

contract LogisticsOracle is Ownable {
    EscrowManager public escrowManager;

    address[3] public providers;    // GHN, GHTK, Viettel Post oracle signers
    uint256 public requiredConsensus = 2;  // 2-of-3

    // orderId => provider => confirmed
    mapping(bytes32 => mapping(address => bool)) public providerConfirmed;
    // orderId => confirmation count
    mapping(bytes32 => uint256) public confirmationCount;
    // orderId => đã báo lên escrow
    mapping(bytes32 => bool) public delivered;

    event ProviderConfirmed(bytes32 indexed orderId, address provider, string trackingCode);
    event ConsensusReached(bytes32 indexed orderId, uint256 confirmedAt);

    modifier onlyProvider() {
        bool isProvider = false;
        for (uint i = 0; i < 3; i++) {
            if (providers[i] == msg.sender) { isProvider = true; break; }
        }
        require(isProvider, "Oracle: not a provider");
        _;
    }

    constructor(address _escrowManager, address[3] memory _providers) Ownable(msg.sender) {
        escrowManager = EscrowManager(_escrowManager);
        providers = _providers;
    }

    function confirmDelivery(bytes32 orderId, string calldata trackingCode) external onlyProvider {
        require(!providerConfirmed[orderId][msg.sender], "Oracle: already confirmed");
        require(!delivered[orderId], "Oracle: already delivered");

        providerConfirmed[orderId][msg.sender] = true;
        confirmationCount[orderId]++;

        emit ProviderConfirmed(orderId, msg.sender, trackingCode);

        if (confirmationCount[orderId] >= requiredConsensus) {
            delivered[orderId] = true;
            escrowManager.confirmDeliveryByOracle(orderId);
            emit ConsensusReached(orderId, block.timestamp);
        }
    }
}
```

## Bước 1.7 — Contract: SettlementContract.sol (L1)

**Mục đích:** Anchor Merkle root của batch transactions lên L1 để immutable audit.

**File:** `packages/contracts/contracts/l1/SettlementContract.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SettlementContract is Ownable {
    struct Batch {
        bytes32 merkleRoot;
        uint256 timestamp;
        uint256 txCount;
        string ipfsMetadataHash;  // chi tiết batch lưu trên IPFS
    }

    Batch[] public batches;
    address public sequencer;  // L2 backend được phép submit batch

    event BatchCommitted(uint256 indexed batchId, bytes32 merkleRoot, uint256 txCount);

    modifier onlySequencer() {
        require(msg.sender == sequencer, "Settlement: not sequencer");
        _;
    }

    constructor(address _sequencer) Ownable(msg.sender) {
        sequencer = _sequencer;
    }

    function commitBatch(
        bytes32 merkleRoot,
        uint256 txCount,
        string calldata ipfsHash
    ) external onlySequencer returns (uint256 batchId) {
        batchId = batches.length;
        batches.push(Batch({ merkleRoot: merkleRoot, timestamp: block.timestamp, txCount: txCount, ipfsMetadataHash: ipfsHash }));
        emit BatchCommitted(batchId, merkleRoot, txCount);
    }

    function verifyTransaction(
        uint256 batchId,
        bytes32 txHash,
        bytes32[] calldata proof
    ) external view returns (bool) {
        require(batchId < batches.length, "Settlement: batch not found");
        return _verifyMerkle(batches[batchId].merkleRoot, txHash, proof);
    }

    function _verifyMerkle(bytes32 root, bytes32 leaf, bytes32[] calldata proof) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint i = 0; i < proof.length; i++) {
            computed = computed < proof[i]
                ? keccak256(abi.encodePacked(computed, proof[i]))
                : keccak256(abi.encodePacked(proof[i], computed));
        }
        return computed == root;
    }

    function getBatchCount() external view returns (uint256) { return batches.length; }
    function setSequencer(address _seq) external onlyOwner { sequencer = _seq; }
}
```

## Bước 1.8 — Tests (Hardhat + Chai)

**File:** `packages/contracts/test/EscrowManager.test.ts`

Viết test cho các scenario:
- `lockEscrow` với valid/invalid merchant signature
- `confirmDelivery` happy path
- `triggerAutoRelease` trước/sau deadline
- `openDispute` trong/ngoài dispute window
- `executeDisputeRuling` với 3 kết quả: release/refund/partial
- Reentrancy attack attempt
- Double-spend với cùng nonce

```bash
# Chạy test
npx hardhat test
npx hardhat coverage  # coverage report
```

## Bước 1.9 — Deploy Scripts

**File:** `packages/contracts/scripts/deploy.ts`

```typescript
// Deploy order: NonceManager (integrated) → SignatureVerifier (integrated) →
// LogisticsOracle → EscrowManager → DisputeResolution → SettlementContract

// Mock ERC20 USDT cho testnet
const MockUSDT = await ethers.deployContract("MockERC20", ["Mock USDT", "mUSDT", 6]);

const oracle = await ethers.deployContract("LogisticsOracle", [
    ethers.ZeroAddress,  // escrow address — cập nhật sau
    [provider1.address, provider2.address, provider3.address]
]);

const escrow = await ethers.deployContract("EscrowManager", [
    treasury.address, oracle.address
]);

await escrow.addAcceptedToken(MockUSDT.target);
await oracle.escrowManager();  // Update escrow address trong oracle
```

## Deliverable Phase 1
- [ ] 6 contracts đã viết và compile sạch
- [ ] Test coverage ≥ 85%
- [ ] Deploy thành công lên Sepolia
- [ ] Export ABI vào `packages/shared/abis/`
- [ ] Ghi lại contract addresses vào `packages/shared/constants/addresses.ts`

---

# PHASE 2 — BACKEND API (Tuần 3–4)

## Mục tiêu Phase 2
Xây dựng NestJS backend làm Payment Orchestrator — nhận order từ frontend, tạo payment payload, track state, xử lý events từ blockchain.

## Bước 2.1 — Khởi tạo NestJS project

```bash
cd packages/backend
npm i -g @nestjs/cli
nest new . --package-manager pnpm
pnpm add @nestjs/config @nestjs/typeorm typeorm pg
pnpm add ethers@6 class-validator class-transformer
pnpm add @nestjs/bull bull ioredis
pnpm add @nestjs/event-emitter
pnpm add uuid crypto
```

## Bước 2.2 — Database Schema (PostgreSQL)

Tạo các TypeORM entities:

### Entity: Order
```typescript
// src/orders/entities/order.entity.ts
@Entity('orders')
export class Order {
    @PrimaryColumn('uuid')
    id: string;                     // platform order ID

    @Column('bytea')
    orderId: Buffer;                // keccak256 hash — dùng trên chain

    @Column()
    merchantId: string;

    @Column()
    customerId: string;

    @Column('decimal', { precision: 20, scale: 6 })
    amount: string;                 // USDT amount

    @Column({ default: 'CREATED' })
    status: OrderStatus;            // CREATED | PAYMENT_PENDING | LOCKED | ...

    @Column({ nullable: true })
    txHash: string;                 // lock transaction hash

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
```

### Entity: Payment
```typescript
// src/payments/entities/payment.entity.ts
@Entity('payments')
export class Payment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    orderId: string;

    @Column()
    paymentRequestId: string;       // UUID cho payment request

    @Column()
    merchantAddress: string;
    @Column()
    customerAddress: string;
    @Column()
    tokenAddress: string;

    @Column('decimal', { precision: 20, scale: 6 })
    amount: string;

    @Column()
    nonce: string;                  // bytes32 hex

    @Column('bigint')
    deadline: number;               // unix timestamp

    @Column({ nullable: true })
    merchantSignature: string;      // hex signature

    @Column({ default: 'PENDING' })
    state: PaymentState;            // PENDING | LOCKED | RELEASED | DISPUTED | REFUNDED

    @Column({ nullable: true })
    chainTxHash: string;

    @Column({ nullable: true })
    lockedAt: Date;
    @Column({ nullable: true })
    releasedAt: Date;

    @CreateDateColumn()
    createdAt: Date;
}
```

### Entity: Dispute
```typescript
@Entity('disputes')
export class Dispute {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    orderId: string;

    @Column()
    initiatorAddress: string;

    @Column({ default: 'OPEN' })
    state: DisputeState;

    @Column('json', { nullable: true })
    evidenceHashes: string[];       // IPFS hashes

    @Column({ nullable: true })
    ruling: string;                 // RELEASE | REFUND | PARTIAL

    @Column({ nullable: true })
    sellerBasisPoints: number;

    @CreateDateColumn()
    createdAt: Date;
}
```

## Bước 2.3 — Payment Request Generator

**File:** `src/payments/payment-request.service.ts`

Logic tạo payment payload mà merchant ký:

```typescript
@Injectable()
export class PaymentRequestService {
    constructor(
        private readonly config: ConfigService,
        private readonly paymentsRepo: Repository<Payment>,
        private readonly ethersService: EthersService,
    ) {}

    async generatePaymentRequest(dto: CreatePaymentRequestDto): Promise<PaymentRequestResponse> {
        // 1. Generate unique nonce
        const nonce = ethers.hexlify(ethers.randomBytes(32));

        // 2. Deadline = now + 30 minutes
        const deadline = Math.floor(Date.now() / 1000) + 1800;

        // 3. Encode orderId
        const orderIdBytes = ethers.keccak256(ethers.toUtf8Bytes(dto.platformOrderId));

        // 4. Build payload
        const payload = {
            merchant: dto.merchantAddress,
            customer: dto.customerAddress,
            amount: ethers.parseUnits(dto.amount, 6),  // USDT 6 decimals
            orderId: orderIdBytes,
            nonce,
            deadline,
            token: this.config.get('USDT_ADDRESS'),
        };

        // 5. Merchant tự ký (merchant backend ký, không phải platform ký)
        //    Platform chỉ forward payload cho merchant ký
        //    Hoặc nếu merchant dùng custodial wallet thì platform ký thay

        // 6. Lưu vào DB
        const payment = await this.paymentsRepo.save({
            orderId: dto.platformOrderId,
            paymentRequestId: uuid(),
            merchantAddress: dto.merchantAddress,
            customerAddress: dto.customerAddress,
            tokenAddress: payload.token,
            amount: dto.amount,
            nonce,
            deadline,
            state: PaymentState.PENDING,
        });

        return { payload, paymentId: payment.id };
    }
}
```

## Bước 2.4 — Blockchain Event Listener

**File:** `src/blockchain/event-listener.service.ts`

Listen events từ EscrowManager contract và update DB:

```typescript
@Injectable()
export class EventListenerService implements OnModuleInit {
    private provider: ethers.WebSocketProvider;
    private escrowContract: ethers.Contract;

    async onModuleInit() {
        this.provider = new ethers.WebSocketProvider(process.env.SEPOLIA_WS_URL);
        this.escrowContract = new ethers.Contract(
            process.env.ESCROW_CONTRACT_ADDRESS,
            ESCROW_ABI,
            this.provider
        );

        // Listen EscrowLocked
        this.escrowContract.on('EscrowLocked', async (orderId, lockedAt, autoReleaseAt) => {
            await this.paymentsService.updateState(orderId, PaymentState.LOCKED);
            await this.notificationService.notifySeller(orderId, 'payment_locked');
            this.eventEmitter.emit('escrow.locked', { orderId, lockedAt });
        });

        // Listen EscrowReleased
        this.escrowContract.on('EscrowReleased', async (orderId, sellerAmount, fee) => {
            await this.paymentsService.updateState(orderId, PaymentState.RELEASED);
            await this.reconciliationService.recordSettlement(orderId, sellerAmount, fee);
        });

        // Listen EscrowDisputed
        this.escrowContract.on('EscrowDisputed', async (orderId, initiator) => {
            await this.paymentsService.updateState(orderId, PaymentState.DISPUTED);
            await this.disputeService.createDisputeRecord(orderId, initiator);
        });

        // Listen DeliveryConfirmed
        this.escrowContract.on('DeliveryConfirmed', async (orderId, confirmedBy) => {
            await this.ordersService.markDelivered(orderId);
            // Start auto-release countdown
            await this.schedulerService.scheduleAutoRelease(orderId);
        });
    }
}
```

## Bước 2.5 — Payment State Machine (Bull Queue)

**File:** `src/payments/payment-state.processor.ts`

```typescript
@Processor('payment-state')
export class PaymentStateProcessor {

    @Process('trigger-auto-release')
    async handleAutoRelease(job: Job<{ orderId: string }>) {
        const { orderId } = job.data;
        // Gọi contract triggerAutoRelease
        await this.ethersService.sendTransaction(
            'triggerAutoRelease',
            [orderId]
        );
    }

    @Process('settle-batch')
    async handleBatchSettlement(job: Job) {
        // Collect tất cả payments confirmed trong 10 phút
        const payments = await this.paymentsRepo.find({
            where: { state: PaymentState.RELEASED, settledInBatch: IsNull() }
        });

        if (payments.length === 0) return;

        // Build Merkle tree
        const leaves = payments.map(p => ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address', 'uint256'],
                [p.orderId, p.merchantAddress, p.amount]
            )
        ));
        const merkleRoot = buildMerkleRoot(leaves);

        // Upload metadata to IPFS via Pinata
        const ipfsHash = await this.ipfsService.uploadBatchMetadata(payments);

        // Commit to L1
        await this.ethersService.sendTransaction(
            'commitBatch',
            [merkleRoot, payments.length, ipfsHash],
            'settlement'  // dùng settlement contract
        );

        // Update DB
        await this.paymentsRepo.update(
            { id: In(payments.map(p => p.id)) },
            { settledInBatch: true }
        );
    }
}
```

## Bước 2.6 — API Endpoints

### Module: PaymentsModule
```
POST   /api/v1/payments/request          # Tạo payment request
GET    /api/v1/payments/:id              # Get payment status
POST   /api/v1/payments/:id/confirm      # Merchant confirm (ký payload)
GET    /api/v1/payments/order/:orderId   # Get payment by orderId
```

### Module: OrdersModule
```
POST   /api/v1/orders                    # Tạo order mới
GET    /api/v1/orders/:id               # Get order
PATCH  /api/v1/orders/:id/status        # Update order status
```

### Module: DisputesModule
```
POST   /api/v1/disputes                  # Mở dispute
POST   /api/v1/disputes/:id/evidence    # Submit evidence (IPFS hash)
GET    /api/v1/disputes/:id             # Get dispute status
POST   /api/v1/disputes/:id/appeal     # Appeal phán quyết
```

### Module: OracleModule (Internal)
```
POST   /api/v1/oracle/delivery          # Webhook từ logistics providers
GET    /api/v1/oracle/status/:orderId   # Oracle confirmation status
```

## Bước 2.7 — Notification Service

```typescript
// src/notifications/notification.service.ts
// Gửi notification qua email (Nodemailer) + WebSocket (Socket.IO)

@Injectable()
export class NotificationService {
    async notifyPaymentLocked(orderId: string, merchantEmail: string) {
        await this.emailService.send({
            to: merchantEmail,
            subject: 'Payment confirmed — prepare to ship',
            template: 'payment-locked',
            context: { orderId }
        });
        this.gateway.emit(orderId, 'payment.locked');
    }
}
```

## Deliverable Phase 2
- [ ] NestJS app chạy được với `pnpm start:dev`
- [ ] Database migrations chạy được
- [ ] Event listener connect được Sepolia WebSocket
- [ ] Payment flow end-to-end: create request → lock → release
- [ ] Bull queue xử lý được auto-release và batch settlement
- [ ] Swagger docs tự động tại `/api/docs`

---

# PHASE 3 — FRONTEND (Tuần 5–6)

## Mục tiêu Phase 3
Xây dựng Customer App (checkout + wallet) và Seller Portal (dashboard), cả hai chạy trên Next.js 14 App Router.

## Bước 3.1 — Khởi tạo Next.js project

```bash
cd packages/frontend
npx create-next-app@latest . --typescript --tailwind --app --src-dir
pnpm add wagmi@2 viem@2 @tanstack/react-query
pnpm add @rainbow-me/rainbowkit       # Wallet connection UI
pnpm add @simplewebauthn/browser      # Passkey support
pnpm add socket.io-client             # Real-time updates
pnpm add zustand                       # State management
pnpm add @radix-ui/react-dialog @radix-ui/react-toast
```

## Bước 3.2 — Wagmi + RainbowKit Setup

**File:** `src/providers/Web3Provider.tsx`

```typescript
'use client';
import { WagmiProvider, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const config = getDefaultConfig({
    appName: 'Blockchain Payment Hub',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID!,
    chains: [sepolia],
    ssr: true,
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
```

## Bước 3.3 — Checkout Flow (Customer)

### Page: `/checkout/[orderId]`

**File:** `src/app/checkout/[orderId]/page.tsx`

Flow:
1. Fetch payment request từ backend (`GET /api/v1/payments/order/:orderId`)
2. Hiển thị order summary + amount in USDT
3. User connect wallet (RainbowKit)
4. User approve USDT spending (`useWriteContract` → ERC20.approve)
5. User submit payment (`useWriteContract` → EscrowManager.lockEscrow)
6. Listen transaction receipt → show success

```typescript
export default function CheckoutPage({ params }: { params: { orderId: string } }) {
    const { data: paymentRequest } = useQuery({
        queryKey: ['payment', params.orderId],
        queryFn: () => fetchPaymentRequest(params.orderId),
    });

    const { writeContract: approve, isPending: approving } = useWriteContract();
    const { writeContract: lockEscrow, isPending: locking } = useWriteContract();
    const { isConnected, address } = useAccount();

    const handlePay = async () => {
        // Step 1: Approve USDT
        await approve({
            address: USDT_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ESCROW_ADDRESS, paymentRequest.payload.amount],
        });
        // Step 2: Lock escrow
        await lockEscrow({
            address: ESCROW_ADDRESS,
            abi: ESCROW_ABI,
            functionName: 'lockEscrow',
            args: [paymentRequest.payload, paymentRequest.merchantSignature],
        });
    };

    return (
        <div className="checkout-container">
            <OrderSummary order={paymentRequest?.order} />
            <PaymentAmount amount={paymentRequest?.payload.amount} />
            {!isConnected ? <ConnectWalletButton /> : (
                <PayButton onClick={handlePay} loading={approving || locking} />
            )}
            <TransactionStatus />
        </div>
    );
}
```

### Component: PaymentStatusTracker

Hiển thị real-time state của payment qua WebSocket:
```
[ Checkout ] → [ Wallet Approved ] → [ Escrow Locked ✓ ] → [ Seller Shipping ] → [ Delivered ] → [ Complete ]
```

## Bước 3.4 — Seller Portal

### Dashboard: `/seller/dashboard`

Hiển thị:
- Orders đang LOCKED (chờ ship)
- Orders đang SHIPPED (oracle đang confirm)
- Orders DISPUTED (cần xử lý)
- Earnings summary (released amount, pending amount, platform fees)
- Recent transactions

### Page: `/seller/orders/[orderId]`

Cho phép seller:
- Xem chi tiết order
- Upload tracking code (gửi về oracle service)
- Xem dispute status và submit counter-evidence

## Bước 3.5 — Passkey / Account Abstraction (Optional cho Phase 3)

Nếu muốn implement Passkey login thay vì MetaMask:

```typescript
// src/hooks/usePasskeyAuth.ts
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export function usePasskeyAuth() {
    const register = async (userId: string) => {
        const options = await fetchRegistrationOptions(userId);
        const attestation = await startRegistration(options);
        await verifyRegistration(attestation);
    };

    const authenticate = async (userId: string) => {
        const options = await fetchAuthenticationOptions(userId);
        const assertion = await startAuthentication(options);
        // assertion → backend verify → issue JWT
        return await verifyAuthentication(assertion);
    };

    return { register, authenticate };
}
```

## Bước 3.6 — Dispute UI

### Page: `/disputes/[disputeId]`

Cho phép customer:
- Xem dispute status
- Upload evidence (photos, chat screenshots) → IPFS via Pinata
- Track arbiter voting progress
- Appeal nếu không đồng ý kết quả

## Deliverable Phase 3
- [ ] Checkout page hoàn chỉnh với full payment flow
- [ ] Wallet connect + USDT approve + lockEscrow working trên Sepolia
- [ ] Real-time payment status updates qua WebSocket
- [ ] Seller dashboard hiển thị orders đúng state
- [ ] Dispute submission UI working
- [ ] Mobile responsive

---

# PHASE 4 — ORACLE SERVICE (Tuần 7)

## Mục tiêu Phase 4
Xây dựng logistics oracle service — nhận webhook từ GHN/GHTK/Viettel Post, aggregate 2-of-3 consensus, gọi contract confirmDelivery.

## Bước 4.1 — Oracle Service (Node.js standalone)

**File:** `packages/oracle/src/index.ts`

```typescript
// packages/oracle/src/webhook.controller.ts
@Controller('webhook')
export class WebhookController {

    // GHN webhook khi hàng được giao thành công
    @Post('ghn')
    async handleGHNWebhook(@Body() payload: GHNWebhookPayload) {
        if (payload.Status !== 'delivered') return;

        const orderId = await this.orderMappingService.getOrderId(payload.order_code);
        await this.oracleService.submitConfirmation('GHN', orderId, payload.order_code);
    }

    // GHTK webhook
    @Post('ghtk')
    async handleGHTKWebhook(@Body() payload: GHTKWebhookPayload) {
        if (payload.status_id !== 4) return;  // 4 = delivered
        const orderId = await this.orderMappingService.getOrderId(payload.label_id);
        await this.oracleService.submitConfirmation('GHTK', orderId, payload.label_id);
    }
}
```

```typescript
// packages/oracle/src/oracle.service.ts
@Injectable()
export class OracleService {
    private contract: ethers.Contract;
    private signer: ethers.Wallet;

    async submitConfirmation(provider: string, orderId: string, trackingCode: string) {
        // Gọi on-chain
        const tx = await this.contract.confirmDelivery(
            ethers.keccak256(ethers.toUtf8Bytes(orderId)),
            trackingCode
        );
        await tx.wait();

        // Log vào backend
        await this.backendService.recordOracleConfirmation({
            provider, orderId, trackingCode, txHash: tx.hash
        });
    }
}
```

## Bước 4.2 — Mock Oracle cho Dev/Testing

Khi chưa có webhook thật từ GHN/GHTK, dùng mock endpoint:

```typescript
// Mock endpoint — chỉ dùng trong development
@Post('mock/deliver/:orderId')
async mockDeliver(@Param('orderId') orderId: string) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException();
    // Simulate 2-of-3: gọi contract 2 lần từ 2 provider address khác nhau
    await this.oracleService.submitConfirmation('MOCK_GHN', orderId, 'MOCK_' + Date.now());
    await this.oracleService.submitConfirmation('MOCK_GHTK', orderId, 'MOCK_' + Date.now());
}
```

## Deliverable Phase 4
- [ ] Webhook handlers cho GHN, GHTK, Viettel Post
- [ ] Oracle contract interaction working
- [ ] Mock deliver endpoint cho testing
- [ ] Retry logic khi on-chain tx fail
- [ ] Logging mọi oracle actions

---

# PHASE 5 — BATCH SETTLEMENT & FIAT BRIDGE (Tuần 8)

## Mục tiêu Phase 5
Implement batch settlement commit lên L1 (mỗi 10 phút) và mock fiat on/off ramp USDT ↔ VND.

## Bước 5.1 — Batch Aggregator (Cron Job)

**File:** `packages/backend/src/settlement/settlement.service.ts`

```typescript
@Injectable()
export class SettlementService {

    @Cron('*/10 * * * *')  // Mỗi 10 phút
    async runBatchSettlement() {
        const payments = await this.getUnbatchedReleasedPayments();
        if (payments.length === 0) return;

        // Build Merkle tree
        const leaves = payments.map(p =>
            ethers.solidityPackedKeccak256(
                ['bytes32', 'address', 'uint256', 'uint256'],
                [p.onChainOrderId, p.merchantAddress, p.amountWei, p.releasedAt]
            )
        );
        const tree = new MerkleTree(leaves, keccak256, { sort: true });
        const root = tree.getHexRoot();

        // Upload batch metadata to IPFS
        const metadata = { payments: payments.map(p => p.toJSON()), generatedAt: Date.now() };
        const { IpfsHash } = await this.pinataService.pinJSON(metadata);

        // Commit to L1
        const tx = await this.settlementContract.commitBatch(root, payments.length, IpfsHash);
        const receipt = await tx.wait();

        // Mark payments as settled
        await this.paymentsRepo.update(
            { id: In(payments.map(p => p.id)) },
            { batchId: receipt.logs[0].topics[1], settledAt: new Date() }
        );

        this.logger.log(`Batch settled: ${payments.length} payments, root: ${root}`);
    }
}
```

## Bước 5.2 — Fiat Bridge Mock (USDT ↔ VND)

Dùng Transak sandbox API hoặc mock:

```typescript
// src/fiat/fiat-bridge.service.ts
@Injectable()
export class FiatBridgeService {

    // Mock: Customer nạp VND → nhận USDT
    async onrampMock(customerId: string, vndAmount: number): Promise<OnrampResult> {
        const exchangeRate = await this.getUSDTVNDRate(); // call Coingecko API
        const usdtAmount = vndAmount / exchangeRate;
        // Trong production: gọi Transak API, trigger KYC flow
        return { usdtAmount, exchangeRate, fee: usdtAmount * 0.015 };
    }

    // Mock: Seller rút USDT → nhận VND về bank
    async offrampMock(merchantId: string, usdtAmount: number, bankAccount: string): Promise<OfframpResult> {
        const exchangeRate = await this.getUSDTVNDRate();
        const vndAmount = usdtAmount * exchangeRate;
        return { vndAmount, exchangeRate, fee: vndAmount * 0.01, estimatedTime: '30 minutes' };
    }

    private async getUSDTVNDRate(): Promise<number> {
        const { data } = await this.httpService.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=vnd'
        ).toPromise();
        return data.tether.vnd;
    }
}
```

## Deliverable Phase 5
- [ ] Cron job batch settlement chạy mỗi 10 phút
- [ ] Merkle tree generation đúng
- [ ] IPFS metadata upload working (Pinata)
- [ ] L1 commit transaction working trên Sepolia
- [ ] Fiat bridge mock endpoint (VND ↔ USDT rate)
- [ ] Verify transaction proof working

---

# PHASE 6 — INTEGRATION, TESTING & DEPLOY (Tuần 9–10)

## Bước 6.1 — End-to-End Integration Test

Test full flow từ đầu đến cuối:

```typescript
// test/e2e/full-payment-flow.e2e.ts
describe('Full Payment Flow', () => {
    it('Happy path: checkout → lock → deliver → release', async () => {
        // 1. Tạo order
        const order = await api.post('/orders', { amount: '10.00', merchantId, customerId });

        // 2. Generate payment request
        const paymentReq = await api.post('/payments/request', { orderId: order.id });

        // 3. Customer lock escrow on-chain
        const tx = await customer.writeContract('lockEscrow', [paymentReq.payload, paymentReq.signature]);
        await tx.wait();

        // 4. Verify event listener updates DB
        await waitFor(() => api.get(`/payments/${paymentReq.id}`).then(r => r.data.state === 'LOCKED'));

        // 5. Oracle confirm delivery
        await api.post('/oracle/mock/deliver/' + order.id);

        // 6. Customer confirm
        await customer.writeContract('confirmDelivery', [paymentReq.orderId]);

        // 7. Verify released
        await waitFor(() => api.get(`/payments/${paymentReq.id}`).then(r => r.data.state === 'RELEASED'));
    });

    it('Dispute path: lock → deliver → dispute → arbiter refund', async () => {
        // ... similar setup ...
        await customer.writeContract('openDispute', [orderId]);
        await arbiter1.writeContract('castVote', [orderId, 2, 0]);  // refund
        await arbiter2.writeContract('castVote', [orderId, 2, 0]);  // refund — 2-of-3 reached
        // Verify customer refunded
    });
});
```

## Bước 6.2 — Security Checklist (trước khi claim trong paper)

```bash
# Chạy Slither static analysis
pip install slither-analyzer
slither packages/contracts/contracts/

# Chạy Mythril symbolic execution
myth analyze packages/contracts/contracts/core/EscrowManager.sol

# Manual review checklist:
# [ ] Reentrancy guards trên mọi external call
# [ ] Integer overflow (Solidity 0.8.x có built-in check)
# [ ] Access control đúng trên mọi sensitive function
# [ ] Signature replay protection (nonce + deadline)
# [ ] Front-running resistance
# [ ] Gas limit trong batch operations
```

## Bước 6.3 — Deploy Production-like Environment

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: payment_hub
      POSTGRES_USER: hub
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine

  backend:
    build: ./packages/backend
    environment:
      - DATABASE_URL=postgresql://hub:${DB_PASSWORD}@postgres:5432/payment_hub
      - REDIS_URL=redis://redis:6379
      - SEPOLIA_RPC_URL=${SEPOLIA_RPC_URL}
      - SEPOLIA_WS_URL=${SEPOLIA_WS_URL}
      - ESCROW_CONTRACT_ADDRESS=${ESCROW_ADDRESS}
      - DEPLOYER_PRIVATE_KEY=${DEPLOYER_PRIVATE_KEY}
    depends_on: [postgres, redis]
    ports: ["3001:3001"]

  frontend:
    build: ./packages/frontend
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:3001
      - NEXT_PUBLIC_WALLETCONNECT_ID=${WALLETCONNECT_ID}

  oracle:
    build: ./packages/oracle
    ports: ["3002:3002"]
    environment:
      - BACKEND_URL=http://backend:3001
      - ORACLE_PRIVATE_KEY=${ORACLE_PRIVATE_KEY}
```

```bash
# Deploy lên Railway hoặc Render
railway up

# Hoặc deploy manual trên VPS
docker-compose -f docker-compose.yml up -d
```

## Bước 6.4 — Demo Setup cho Paper

Chuẩn bị demo scenario:

1. **Sepolia Faucet:** Lấy SepoliaETH từ https://sepoliafaucet.com
2. **Mock USDT:** Mint mock USDT từ deploy script
3. **Test accounts:** 3 account (merchant, customer, arbiter)
4. **Demo script:** Screenplay từng bước để demo cho committee

## Deliverable Phase 6
- [ ] Full E2E test suite pass
- [ ] Slither analysis không có high-severity issues
- [ ] Docker Compose chạy được locally
- [ ] Deploy lên Railway/Render thành công
- [ ] Demo scenario documented
- [ ] All contract addresses và tx hashes ghi lại cho paper

---

# ENVIRONMENT VARIABLES (.env.example)

```bash
# Blockchain
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
SEPOLIA_WS_URL=wss://sepolia.infura.io/ws/v3/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0x...
ORACLE_PRIVATE_KEY=0x...

# Contract Addresses (sau khi deploy Phase 1)
ESCROW_CONTRACT_ADDRESS=0x...
DISPUTE_CONTRACT_ADDRESS=0x...
SETTLEMENT_CONTRACT_ADDRESS=0x...
LOGISTICS_ORACLE_ADDRESS=0x...
USDT_ADDRESS=0x...  # Mock USDT trên Sepolia

# Database
DATABASE_URL=postgresql://hub:password@localhost:5432/payment_hub

# Redis
REDIS_URL=redis://localhost:6379

# IPFS
PINATA_API_KEY=...
PINATA_SECRET_KEY=...

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_ID=...
NEXT_PUBLIC_ESCROW_ADDRESS=0x...
NEXT_PUBLIC_USDT_ADDRESS=0x...

# Notification
SMTP_HOST=smtp.gmail.com
SMTP_USER=...
SMTP_PASS=...

# Fiat Bridge (Sandbox)
TRANSAK_API_KEY=...
TRANSAK_ENV=STAGING
```

---

# DEPENDENCY MAP

```
Phase 1 (Contracts) → Phase 2 (Backend)
                    → Phase 4 (Oracle)
Phase 2 (Backend)   → Phase 3 (Frontend)
                    → Phase 5 (Settlement)
Phase 1 + 2 + 3 + 4 + 5 → Phase 6 (Integration)
```

---

# TOOLS & COMMANDS NHANH

```bash
# Phase 1
cd packages/contracts && npx hardhat test
npx hardhat run scripts/deploy.ts --network sepolia
npx hardhat verify --network sepolia CONTRACT_ADDRESS

# Phase 2
cd packages/backend && pnpm start:dev
pnpm typeorm migration:run

# Phase 3
cd packages/frontend && pnpm dev

# Phase 4
cd packages/oracle && pnpm start:dev

# All together
pnpm --filter backend start:dev &
pnpm --filter frontend dev &
pnpm --filter oracle start:dev &

# Docker
docker-compose up -d
docker-compose logs -f backend
```

---

# RESEARCH NOTES (cho paper)

## Các điểm novelty cần highlight trong implementation
1. **4-layer integration:** Marketplace (Frontend) + Payment (EscrowManager) + Reputation-gated (SignatureVerifier + NonceManager) + Runtime security (DisputeResolution + Oracle)
2. **Gasless UX via Account Abstraction:** EIP-4337 Passkey flow loại bỏ friction của traditional crypto wallet
3. **2-of-3 Oracle Consensus:** Decentralized delivery verification không phụ thuộc 1 provider
4. **Fiat bridge cho emerging markets:** USDT ↔ VND on/off ramp phục vụ users không có crypto

## Metrics cần đo cho paper
- Transaction throughput (TPS) trong batch settlement
- Gas cost per payment (lockEscrow, confirmDelivery, openDispute)
- End-to-end latency: customer clicks pay → EscrowLocked event (~2.4s target)
- Dispute resolution time distribution
- Smart contract code coverage %

---
*Generated for PhD dissertation research — Blockchain Payment Hub Prototype*
*Tất cả contracts chỉ deploy trên Sepolia testnet — KHÔNG dùng mainnet*
