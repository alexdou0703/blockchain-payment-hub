export declare enum OrderStatus {
    CREATED = "CREATED",
    PAYMENT_PENDING = "PAYMENT_PENDING",
    LOCKED = "LOCKED",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    COMPLETED = "COMPLETED",
    DISPUTED = "DISPUTED",
    CANCELLED = "CANCELLED"
}
export declare enum PaymentState {
    PENDING = "PENDING",
    LOCKED = "LOCKED",
    RELEASED = "RELEASED",
    AUTO_RELEASED = "AUTO_RELEASED",
    DISPUTED = "DISPUTED",
    REFUNDED = "REFUNDED",
    PARTIAL_REFUND = "PARTIAL_REFUND"
}
export declare enum DisputeState {
    OPEN = "OPEN",
    VOTING = "VOTING",
    RESOLVED = "RESOLVED",
    APPEALED = "APPEALED",
    FINAL = "FINAL"
}
export interface PaymentPayload {
    merchant: string;
    customer: string;
    amount: string;
    orderId: string;
    nonce: string;
    deadline: number;
    token: string;
}
export declare const ESCROW_ABI: readonly [{
    readonly type: "event";
    readonly name: "EscrowCreated";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "merchant";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "customer";
        readonly type: "address";
        readonly indexed: true;
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "token";
        readonly type: "address";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "EscrowLocked";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "lockedAt";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "autoReleaseAt";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "EscrowReleased";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "sellerAmount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "platformFee";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "EscrowAutoReleased";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }];
}, {
    readonly type: "event";
    readonly name: "EscrowDisputed";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "initiator";
        readonly type: "address";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "EscrowRefunded";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "customerAmount";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "EscrowPartialRefund";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "customerAmount";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "sellerAmount";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "DeliveryConfirmed";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "confirmedBy";
        readonly type: "address";
        readonly indexed: false;
    }];
}, {
    readonly type: "function";
    readonly name: "lockEscrow";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "payload";
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "merchant";
            readonly type: "address";
        }, {
            readonly name: "customer";
            readonly type: "address";
        }, {
            readonly name: "amount";
            readonly type: "uint256";
        }, {
            readonly name: "orderId";
            readonly type: "bytes32";
        }, {
            readonly name: "nonce";
            readonly type: "bytes32";
        }, {
            readonly name: "deadline";
            readonly type: "uint256";
        }, {
            readonly name: "token";
            readonly type: "address";
        }];
    }, {
        readonly name: "merchantSignature";
        readonly type: "bytes";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "confirmDelivery";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "triggerAutoRelease";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "openDispute";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "executeDisputeRuling";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }, {
        readonly name: "sellerBasisPoints";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "addAcceptedToken";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "token";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "setOracleAggregator";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "oracle";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}];
export declare const DISPUTE_ABI: readonly [{
    readonly type: "event";
    readonly name: "DisputeOpened";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "initiator";
        readonly type: "address";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "EvidenceSubmitted";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "submitter";
        readonly type: "address";
        readonly indexed: false;
    }, {
        readonly name: "ipfsHash";
        readonly type: "string";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "ArbiterVoted";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "arbiter";
        readonly type: "address";
        readonly indexed: false;
    }, {
        readonly name: "vote";
        readonly type: "uint8";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "DisputeResolved";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "sellerBasisPoints";
        readonly type: "uint256";
        readonly indexed: false;
    }, {
        readonly name: "isFinal";
        readonly type: "bool";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "DisputeAppealed";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }];
}, {
    readonly type: "event";
    readonly name: "DisputeFinalized";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "sellerBasisPoints";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "function";
    readonly name: "createDispute";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }, {
        readonly name: "initiator";
        readonly type: "address";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "submitEvidence";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }, {
        readonly name: "ipfsHash";
        readonly type: "string";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "startVoting";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "castVote";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }, {
        readonly name: "vote";
        readonly type: "uint8";
    }, {
        readonly name: "sellerBasisPoints";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "appeal";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "finalize";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }];
    readonly outputs: readonly [];
}];
export declare const ORACLE_ABI: readonly [{
    readonly type: "event";
    readonly name: "ProviderConfirmed";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "provider";
        readonly type: "address";
        readonly indexed: false;
    }, {
        readonly name: "trackingCode";
        readonly type: "string";
        readonly indexed: false;
    }];
}, {
    readonly type: "event";
    readonly name: "ConsensusReached";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
        readonly indexed: true;
    }, {
        readonly name: "confirmedAt";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "function";
    readonly name: "confirmDelivery";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }, {
        readonly name: "trackingCode";
        readonly type: "string";
    }];
    readonly outputs: readonly [];
}];
export declare const SETTLEMENT_ABI: readonly [{
    readonly type: "event";
    readonly name: "BatchCommitted";
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly name: "batchId";
        readonly type: "uint256";
        readonly indexed: true;
    }, {
        readonly name: "merkleRoot";
        readonly type: "bytes32";
        readonly indexed: false;
    }, {
        readonly name: "txCount";
        readonly type: "uint256";
        readonly indexed: false;
    }];
}, {
    readonly type: "function";
    readonly name: "commitBatch";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "merkleRoot";
        readonly type: "bytes32";
    }, {
        readonly name: "txCount";
        readonly type: "uint256";
    }, {
        readonly name: "ipfsHash";
        readonly type: "string";
    }];
    readonly outputs: readonly [{
        readonly name: "batchId";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "verifyTransaction";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "batchId";
        readonly type: "uint256";
    }, {
        readonly name: "txHash";
        readonly type: "bytes32";
    }, {
        readonly name: "proof";
        readonly type: "bytes32[]";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "getBatchCount";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
}];
export declare const ERC20_ABI: readonly [{
    readonly type: "function";
    readonly name: "approve";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "transfer";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "transferFrom";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "from";
        readonly type: "address";
    }, {
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "balanceOf";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "allowance";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "spender";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "decimals";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint8";
    }];
}];
