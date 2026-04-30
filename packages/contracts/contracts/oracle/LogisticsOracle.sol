// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IEscrow.sol";

// FIX (vs original plan):
// - Uses IEscrow interface instead of importing EscrowManager directly
//   (avoids circular import; EscrowManager imports IDisputeResolution,
//   LogisticsOracle would create a second dependency chain).
// - Added setEscrowManager() so the deploy script can wire the address
//   after EscrowManager is deployed. Without this the oracle was
//   permanently pointing at address(0).
contract LogisticsOracle is Ownable {

    IEscrow public escrowManager;

    address[3] public providers;         // GHN, GHTK, Viettel Post oracle signers
    uint256 public requiredConsensus = 2; // 2-of-3

    // orderId => provider => confirmed
    mapping(bytes32 => mapping(address => bool)) public providerConfirmed;
    mapping(bytes32 => uint256) public confirmationCount;
    mapping(bytes32 => bool) public delivered;

    event ProviderConfirmed(bytes32 indexed orderId, address provider, string trackingCode);
    event ConsensusReached(bytes32 indexed orderId, uint256 confirmedAt);

    modifier onlyProvider() {
        bool found = false;
        for (uint i = 0; i < 3; i++) {
            if (providers[i] == msg.sender) { found = true; break; }
        }
        require(found, "Oracle: not a provider");
        _;
    }

    // _escrowManager can be address(0) at deploy time; call setEscrowManager() after.
    constructor(address _escrowManager, address[3] memory _providers) Ownable(msg.sender) {
        escrowManager = IEscrow(_escrowManager);
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

    // ===== ADMIN =====

    function setEscrowManager(address _em) external onlyOwner {
        require(_em != address(0), "Oracle: zero address");
        escrowManager = IEscrow(_em);
    }

    function setRequiredConsensus(uint256 n) external onlyOwner {
        require(n > 0 && n <= 3, "Oracle: invalid consensus");
        requiredConsensus = n;
    }
}
