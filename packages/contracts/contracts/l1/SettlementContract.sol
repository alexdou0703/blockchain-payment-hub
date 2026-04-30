// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

// Anchors Merkle roots of batched payment settlements onto L1 (Sepolia).
// The backend cron job builds the Merkle tree, uploads metadata to IPFS,
// then calls commitBatch(). Anyone can then call verifyTransaction() with
// a Merkle proof to confirm a specific payment was included in a batch.
contract SettlementContract is Ownable {

    struct Batch {
        bytes32 merkleRoot;
        uint256 timestamp;
        uint256 txCount;
        string  ipfsMetadataHash;
    }

    Batch[] public batches;
    address public sequencer;  // only the backend sequencer may commit

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
        batches.push(Batch({
            merkleRoot:        merkleRoot,
            timestamp:         block.timestamp,
            txCount:           txCount,
            ipfsMetadataHash:  ipfsHash
        }));
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

    function _verifyMerkle(
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint i = 0; i < proof.length; i++) {
            computed = computed < proof[i]
                ? keccak256(abi.encodePacked(computed, proof[i]))
                : keccak256(abi.encodePacked(proof[i], computed));
        }
        return computed == root;
    }

    function getBatchCount() external view returns (uint256) { return batches.length; }

    function setSequencer(address _seq) external onlyOwner {
        require(_seq != address(0), "Settlement: zero address");
        sequencer = _seq;
    }
}
