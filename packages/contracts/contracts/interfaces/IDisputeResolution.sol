// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal interface used by EscrowManager to call DisputeResolution
// without a circular import.
interface IDisputeResolution {
    function createDispute(bytes32 orderId, address initiator) external;
}
