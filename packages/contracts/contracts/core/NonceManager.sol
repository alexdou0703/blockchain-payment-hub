// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract NonceManager {
    mapping(address => uint256) private _nonces;
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
