// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IEscrow.sol";
import "../interfaces/IDisputeResolution.sol";

// FIX SUMMARY (vs original plan):
//
// B1 — `escrowManager.escrows(orderId)` as storage ref: structs with nested
//      mappings can't be returned from external calls. Fixed by calling
//      IEscrow.getEscrowParties() which returns only the two address fields needed.
//
// B2 — disputes[] never initialised: EscrowManager.openDispute() now calls
//      createDispute() here, which initialises the Dispute record.
//
// B3 — appeal() set state to APPEALED but castVote() required VOTING, locking
//      arbiters out of round 2. Fixed: appeal() sets state directly to VOTING.
//
// B4 — _resolve() called executeDisputeRuling() twice (once per round), but
//      escrow is already settled after round 1. Fixed: funds are held until
//      _execute(), which is called only once — either by finalize() after the
//      appeal window, or automatically on the second-round resolve.
//
// BONUS — hasVoted not reset on appeal: nested mappings can't be deleted.
//      Fixed by keying hasVoted on (orderId, round, arbiter).

contract DisputeResolution is Ownable, IDisputeResolution {

    // ===== STRUCTS / ENUMS =====

    struct Dispute {
        bytes32 orderId;
        address initiator;
        uint256 openedAt;
        uint256 evidenceDeadline;
        uint256 votingDeadline;
        uint256 appealDeadline;
        DisputeState state;
        uint256 currentRound;    // 0 = first vote, 1 = appeal vote
        uint256 yesVotes;        // votes to release to seller
        uint256 noVotes;         // votes to refund to customer
        uint256 sellerBasisPoints;
        bool executed;           // guards against double-execution
    }

    enum DisputeState {
        OPEN,       // evidence window
        VOTING,     // arbiters voting
        RESOLVED,   // first ruling stored, appeal window open
        FINAL       // irreversible, funds disbursed
    }

    // ===== STATE =====

    IEscrow public escrowManager;
    address[3] public arbiters;

    uint256 public evidenceWindow = 72 hours;
    uint256 public votingWindow   = 48 hours;
    uint256 public appealWindow   = 48 hours;

    mapping(bytes32 => Dispute) public disputes;
    mapping(bytes32 => string[]) public evidenceHashes;

    // Keyed by (orderId, round, arbiter) — avoids the "can't delete nested
    // mapping" problem when a dispute enters round 2.
    mapping(bytes32 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    // ===== EVENTS =====

    event DisputeOpened(bytes32 indexed orderId, address initiator);
    event EvidenceSubmitted(bytes32 indexed orderId, address submitter, string ipfsHash);
    event ArbiterVoted(bytes32 indexed orderId, address arbiter, uint8 vote);
    event DisputeResolved(bytes32 indexed orderId, uint256 sellerBasisPoints, bool isFinal);
    event DisputeAppealed(bytes32 indexed orderId);
    event DisputeFinalized(bytes32 indexed orderId, uint256 sellerBasisPoints);

    // ===== MODIFIERS =====

    modifier onlyArbiter() {
        bool found = false;
        for (uint i = 0; i < 3; i++) {
            if (arbiters[i] == msg.sender) { found = true; break; }
        }
        require(found, "Dispute: not an arbiter");
        _;
    }

    modifier disputeOpen(bytes32 orderId) {
        require(disputes[orderId].openedAt != 0, "Dispute: not found");
        _;
    }

    // ===== CONSTRUCTOR =====

    constructor(address _escrowManager, address[3] memory _arbiters) Ownable(msg.sender) {
        escrowManager = IEscrow(_escrowManager);
        arbiters = _arbiters;
    }

    // ===== CALLED BY ESCROWMANAGER =====

    // EscrowManager.openDispute() calls this to initialise the dispute record.
    // onlyEscrowManager ensures no external party can spam fake disputes.
    function createDispute(bytes32 orderId, address initiator) external override {
        require(msg.sender == address(escrowManager), "Dispute: only escrow manager");
        require(disputes[orderId].openedAt == 0, "Dispute: already exists");

        disputes[orderId] = Dispute({
            orderId:          orderId,
            initiator:        initiator,
            openedAt:         block.timestamp,
            evidenceDeadline: block.timestamp + evidenceWindow,
            votingDeadline:   0,
            appealDeadline:   0,
            state:            DisputeState.OPEN,
            currentRound:     0,
            yesVotes:         0,
            noVotes:          0,
            sellerBasisPoints: 0,
            executed:         false
        });

        emit DisputeOpened(orderId, initiator);
    }

    // ===== EVIDENCE =====

    function submitEvidence(bytes32 orderId, string calldata ipfsHash)
        external
        disputeOpen(orderId)
    {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.OPEN, "Dispute: not in evidence phase");
        require(block.timestamp <= d.evidenceDeadline, "Dispute: evidence window closed");
        evidenceHashes[orderId].push(ipfsHash);
        emit EvidenceSubmitted(orderId, msg.sender, ipfsHash);
    }

    // Anyone can call once evidence window closes — moves to voting phase.
    function startVoting(bytes32 orderId) external disputeOpen(orderId) {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.OPEN, "Dispute: not in evidence phase");
        require(block.timestamp > d.evidenceDeadline, "Dispute: evidence window still open");
        d.state = DisputeState.VOTING;
        d.votingDeadline = block.timestamp + votingWindow;
    }

    // ===== VOTING =====

    // @param vote  1 = release to seller, 2 = refund to customer
    // @param sellerBasisPoints  only used when vote=1 and partial split wanted (0–10000)
    function castVote(bytes32 orderId, uint8 vote, uint256 sellerBasisPoints)
        external
        onlyArbiter
        disputeOpen(orderId)
    {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.VOTING, "Dispute: not in voting phase");
        require(block.timestamp <= d.votingDeadline, "Dispute: voting deadline passed");
        require(!hasVoted[orderId][d.currentRound][msg.sender], "Dispute: already voted this round");
        require(vote == 1 || vote == 2, "Dispute: invalid vote (1=release, 2=refund)");
        require(sellerBasisPoints <= 10000, "Dispute: invalid basis points");

        hasVoted[orderId][d.currentRound][msg.sender] = true;

        if (vote == 1) d.yesVotes++;
        else           d.noVotes++;

        emit ArbiterVoted(orderId, msg.sender, vote);

        // 2-of-3 quorum reached
        if (d.yesVotes >= 2) {
            _resolve(orderId, sellerBasisPoints > 0 ? sellerBasisPoints : 10000);
        } else if (d.noVotes >= 2) {
            _resolve(orderId, 0);
        }
    }

    // ===== APPEAL =====

    // Either party can appeal within appealWindow after first ruling.
    // FIX B3: goes directly to VOTING (not a new APPEALED state) so
    //         castVote()'s state check passes in round 2.
    function appeal(bytes32 orderId) external disputeOpen(orderId) {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.RESOLVED, "Dispute: not in resolved state");
        require(d.currentRound == 0, "Dispute: only one appeal allowed");
        require(block.timestamp <= d.appealDeadline, "Dispute: appeal window closed");

        (address customer, address merchant) = escrowManager.getEscrowParties(orderId);
        require(msg.sender == customer || msg.sender == merchant, "Dispute: not a party");

        // Advance to round 1; hasVoted keying by round prevents old votes interfering.
        d.currentRound = 1;
        d.yesVotes     = 0;
        d.noVotes      = 0;
        d.state        = DisputeState.VOTING;
        d.votingDeadline = block.timestamp + votingWindow;

        emit DisputeAppealed(orderId);
    }

    // ===== FINALIZE =====

    // Called by anyone after appeal window expires with no appeal.
    // Executes the stored ruling on-chain (transfers funds).
    function finalize(bytes32 orderId) external disputeOpen(orderId) {
        Dispute storage d = disputes[orderId];
        require(d.state == DisputeState.RESOLVED, "Dispute: not resolved");
        require(block.timestamp > d.appealDeadline, "Dispute: appeal window still open");
        _execute(orderId);
    }

    // ===== INTERNAL =====

    // FIX B4: Funds are NOT transferred here. _resolve() only stores the ruling
    // and either opens the appeal window (round 0) or calls _execute() directly
    // (round 1 — no more appeals possible).
    function _resolve(bytes32 orderId, uint256 sellerBasisPoints) internal {
        Dispute storage d = disputes[orderId];
        d.sellerBasisPoints = sellerBasisPoints;

        if (d.currentRound >= 1) {
            // Final round — no appeal, execute immediately.
            _execute(orderId);
        } else {
            // First round — store ruling, open appeal window.
            d.state = DisputeState.RESOLVED;
            d.appealDeadline = block.timestamp + appealWindow;
            emit DisputeResolved(orderId, sellerBasisPoints, false);
        }
    }

    // Transfers funds exactly once via EscrowManager.executeDisputeRuling().
    function _execute(bytes32 orderId) internal {
        Dispute storage d = disputes[orderId];
        require(!d.executed, "Dispute: already executed");
        d.executed = true;
        d.state    = DisputeState.FINAL;
        escrowManager.executeDisputeRuling(orderId, d.sellerBasisPoints);
        emit DisputeFinalized(orderId, d.sellerBasisPoints);
    }

    // ===== ADMIN =====

    function setEscrowManager(address _em) external onlyOwner {
        escrowManager = IEscrow(_em);
    }

    function getEvidenceCount(bytes32 orderId) external view returns (uint256) {
        return evidenceHashes[orderId].length;
    }
}
