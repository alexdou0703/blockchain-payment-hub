// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature)
        external view returns (bytes4 magicValue);
}

// FIX (vs original plan): Uses EIP712 domain separator instead of raw eth_sign.
// The original used MessageHashUtils.toEthSignedMessageHash which is personal-sign
// and incompatible with frontend eth_signTypedData_v4. Now correctly uses
// _hashTypedDataV4 so MetaMask signTypedData signatures verify on-chain.
abstract contract SignatureVerifier is EIP712 {
    using ECDSA for bytes32;

    bytes4 private constant ERC1271_MAGIC = 0x1626ba7e;

    struct PaymentPayload {
        address merchant;
        address customer;
        uint256 amount;       // USDT wei (6 decimals)
        bytes32 orderId;      // keccak256(platform_order_id)
        bytes32 nonce;        // unique per payment
        uint256 deadline;     // unix timestamp
        address token;        // ERC20 token address
    }

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "PaymentPayload(address merchant,address customer,uint256 amount,bytes32 orderId,bytes32 nonce,uint256 deadline,address token)"
    );

    // Called automatically when EscrowManager (the concrete contract) is deployed.
    constructor() EIP712("BlockchainPaymentHub", "1") {}

    function hashPayload(PaymentPayload calldata payload) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            payload.merchant,
            payload.customer,
            payload.amount,
            payload.orderId,
            payload.nonce,
            payload.deadline,
            payload.token
        )));
    }

    function _verifyMerchantSignature(
        PaymentPayload calldata payload,
        bytes calldata signature
    ) internal view returns (bool) {
        bytes32 hash = hashPayload(payload);

        // Try EOA signature first
        address recovered = ECDSA.recover(hash, signature);
        if (recovered == payload.merchant) return true;

        // EIP-1271 fallback only for smart contract wallets.
        // Checking extcodesize first avoids an ABI-decode panic when calling
        // isValidSignature on an EOA (call succeeds with empty return data,
        // but decoding empty bytes as bytes4 is undefined behaviour).
        address merchant = payload.merchant;
        uint256 codeSize;
        assembly { codeSize := extcodesize(merchant) }
        if (codeSize == 0) return false;

        try IERC1271(payload.merchant).isValidSignature(hash, signature) returns (bytes4 magic) {
            return magic == ERC1271_MAGIC;
        } catch {
            return false;
        }
    }
}
