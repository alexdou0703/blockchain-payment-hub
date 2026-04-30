// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal interface used by DisputeResolution and LogisticsOracle
// to avoid circular imports with the full EscrowManager contract.
interface IEscrow {
    function executeDisputeRuling(bytes32 orderId, uint256 sellerBasisPoints) external;
    function getEscrowParties(bytes32 orderId) external view returns (address customer, address merchant);
    function confirmDeliveryByOracle(bytes32 orderId) external;
}
