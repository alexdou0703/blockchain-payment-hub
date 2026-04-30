// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./NonceManager.sol";
import "./SignatureVerifier.sol";
import "../interfaces/IDisputeResolution.sol";

contract EscrowManager is NonceManager, SignatureVerifier, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ===== ENUMS =====
    enum EscrowState {
        CREATED,        // reserved for potential pre-registration flows (currently unused)
        LOCKED,         // funds locked in escrow
        RELEASED,       // funds released to seller
        AUTO_RELEASED,  // auto-released after timeout
        DISPUTED,       // dispute in progress
        REFUNDED,       // full refund to customer
        PARTIAL_REFUND  // partial refund (split ruling)
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
        uint256 deliveredAt;      // 0 if not yet delivered
        uint256 autoReleaseAt;
        bool oracleConfirmed;
    }

    // ===== STATE =====
    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => bool) public orderExists;

    address public platformTreasury;
    address public disputeContract;
    address public oracleAggregator;

    uint256 public defaultPlatformFeeRate = 250;     // 2.5%
    uint256 public deliveryWindowSeconds = 3 days;
    uint256 public confirmWindowSeconds  = 7 days;
    uint256 public disputeWindowSeconds  = 7 days;

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

    // SignatureVerifier constructor (which initialises EIP712) is called
    // automatically via the inheritance chain — no explicit call needed here.
    constructor(address _treasury, address _oracle) Ownable(msg.sender) {
        platformTreasury = _treasury;
        oracleAggregator = _oracle;
    }

    // ===== VIEW =====

    // FIX: Expose escrow parties via a view function so DisputeResolution
    // (and LogisticsOracle) can query them without holding a storage pointer
    // to a struct that contains nested mappings (which Solidity cannot return).
    function getEscrowParties(bytes32 orderId)
        external view
        escrowExists(orderId)
        returns (address customer, address merchant)
    {
        return (escrows[orderId].customer, escrows[orderId].merchant);
    }

    // ===== CORE FUNCTIONS =====

    function lockEscrow(
        PaymentPayload calldata payload,
        bytes calldata merchantSignature
    ) external nonReentrant {
        require(acceptedTokens[payload.token], "Escrow: token not accepted");
        require(block.timestamp <= payload.deadline, "Escrow: payment expired");
        require(!orderExists[payload.orderId], "Escrow: order already exists");
        require(payload.amount > 0, "Escrow: zero amount");
        require(msg.sender == payload.customer, "Escrow: not the customer");

        require(_verifyMerchantSignature(payload, merchantSignature), "Escrow: invalid merchant signature");
        _validateAndUseNonce(payload.merchant, payload.nonce);

        uint256 lockedAt = block.timestamp;
        uint256 autoReleaseAt = lockedAt + deliveryWindowSeconds + confirmWindowSeconds;

        escrows[payload.orderId] = Escrow({
            orderId:         payload.orderId,
            merchant:        payload.merchant,
            customer:        payload.customer,
            token:           payload.token,
            amount:          payload.amount,
            platformFeeRate: defaultPlatformFeeRate,
            state:           EscrowState.LOCKED,
            lockedAt:        lockedAt,
            deliveredAt:     0,
            autoReleaseAt:   autoReleaseAt,
            oracleConfirmed: false
        });
        orderExists[payload.orderId] = true;

        IERC20(payload.token).safeTransferFrom(msg.sender, address(this), payload.amount);

        emit EscrowCreated(payload.orderId, payload.merchant, payload.customer, payload.amount, payload.token);
        emit EscrowLocked(payload.orderId, lockedAt, autoReleaseAt);
    }

    function confirmDelivery(bytes32 orderId)
        external
        nonReentrant
        escrowExists(orderId)
        inState(orderId, EscrowState.LOCKED)
    {
        require(msg.sender == escrows[orderId].customer, "Escrow: only customer");
        _releaseToSeller(orderId, EscrowState.RELEASED);
        emit DeliveryConfirmed(orderId, msg.sender);
    }

    // Called by LogisticsOracle after 2-of-3 provider consensus.
    // Does NOT release funds immediately — starts the confirm window.
    // Buyer must call confirmDelivery or wait for triggerAutoRelease.
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
        emit DeliveryConfirmed(orderId, msg.sender);
    }

    function triggerAutoRelease(bytes32 orderId)
        external
        nonReentrant
        escrowExists(orderId)
        inState(orderId, EscrowState.LOCKED)
    {
        require(block.timestamp >= escrows[orderId].autoReleaseAt, "Escrow: too early for auto-release");
        _releaseToSeller(orderId, EscrowState.AUTO_RELEASED);
        emit EscrowAutoReleased(orderId);
    }

    // FIX (vs original plan):
    // 1. Removed hard requirement on oracleConfirmed — allows dispute when
    //    item never arrived (oracle never triggered) after deliveryWindow.
    // 2. Calls IDisputeResolution.createDispute() so DisputeResolution
    //    initialises its own record (previously disputes[] was never populated).
    function openDispute(bytes32 orderId)
        external
        nonReentrant
        escrowExists(orderId)
        inState(orderId, EscrowState.LOCKED)
    {
        Escrow storage e = escrows[orderId];
        require(msg.sender == e.customer, "Escrow: only customer");

        // Allow dispute when oracle confirmed delivery OR when seller has had
        // enough time to ship and hasn't (delivery window elapsed).
        require(
            e.oracleConfirmed || block.timestamp > e.lockedAt + deliveryWindowSeconds,
            "Escrow: too early to dispute"
        );
        require(
            block.timestamp <= e.lockedAt + deliveryWindowSeconds + disputeWindowSeconds,
            "Escrow: dispute window closed"
        );

        e.state = EscrowState.DISPUTED;

        // Wire to DisputeResolution if set (set via setDisputeContract after deploy).
        if (disputeContract != address(0)) {
            IDisputeResolution(disputeContract).createDispute(orderId, msg.sender);
        }

        emit EscrowDisputed(orderId, msg.sender);
    }

    // Called exclusively by DisputeResolution._execute() once a ruling is final.
    function executeDisputeRuling(bytes32 orderId, uint256 sellerBasisPoints)
        external
        nonReentrant
        onlyDisputeContract
        escrowExists(orderId)
        inState(orderId, EscrowState.DISPUTED)
    {
        require(sellerBasisPoints <= 10000, "Escrow: invalid basis points");

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

        uint256 sellerGross    = (e.amount * sellerBasisPoints) / 10000;
        uint256 customerAmount = e.amount - sellerGross;
        uint256 fee            = (sellerGross * e.platformFeeRate) / 10000;
        uint256 sellerNet      = sellerGross - fee;

        IERC20(e.token).safeTransfer(e.merchant, sellerNet);
        IERC20(e.token).safeTransfer(e.customer, customerAmount);
        if (fee > 0) IERC20(e.token).safeTransfer(platformTreasury, fee);

        emit EscrowPartialRefund(orderId, customerAmount, sellerNet);
    }

    // ===== ADMIN =====
    function addAcceptedToken(address token)       external onlyOwner { acceptedTokens[token] = true; }
    function removeAcceptedToken(address token)    external onlyOwner { acceptedTokens[token] = false; }
    function setDisputeContract(address _dispute)  external onlyOwner { disputeContract = _dispute; }
    function setOracleAggregator(address _oracle)  external onlyOwner { oracleAggregator = _oracle; }
    function setPlatformTreasury(address _treasury) external onlyOwner { platformTreasury = _treasury; }
    function setFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= 1000, "Escrow: fee too high");
        defaultPlatformFeeRate = _feeRate;
    }
}
