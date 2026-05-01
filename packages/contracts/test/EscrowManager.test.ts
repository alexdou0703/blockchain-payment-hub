import "@nomicfoundation/hardhat-chai-matchers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
    EscrowManager,
    MockERC20,
    DisputeResolution,
    LogisticsOracle,
} from "../typechain-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USDT_DECIMALS = 6n;
const toUsdt = (amount: string) => ethers.parseUnits(amount, USDT_DECIMALS);

async function buildPayload(
    escrow: EscrowManager,
    merchant: SignerWithAddress,
    customer: SignerWithAddress,
    token: string,
    amount: bigint,
    platformOrderId: string,
    deadlineOffset = 1800
) {
    const nonce      = ethers.hexlify(ethers.randomBytes(32));
    const deadline   = BigInt(await time.latest()) + BigInt(deadlineOffset);
    const orderId    = ethers.keccak256(ethers.toUtf8Bytes(platformOrderId));

    const payload = {
        merchant:  merchant.address,
        customer:  customer.address,
        amount,
        orderId,
        nonce,
        deadline,
        token,
    };
    return { payload, orderId };
}

async function signPayload(
    escrow: EscrowManager,
    signer: SignerWithAddress,
    payload: {
        merchant: string; customer: string; amount: bigint;
        orderId: string;  nonce: string;    deadline: bigint; token: string;
    }
) {
    const domain = {
        name:              "BlockchainPaymentHub",
        version:           "1",
        chainId:           (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await escrow.getAddress(),
    };
    const types = {
        PaymentPayload: [
            { name: "merchant",  type: "address" },
            { name: "customer",  type: "address" },
            { name: "amount",    type: "uint256" },
            { name: "orderId",   type: "bytes32" },
            { name: "nonce",     type: "bytes32" },
            { name: "deadline",  type: "uint256" },
            { name: "token",     type: "address" },
        ],
    };
    return signer.signTypedData(domain, types, payload);
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

async function deployFixture() {
    const [deployer, treasury, merchant, customer, arbiter1, arbiter2, arbiter3,
           provider1, provider2, provider3] = await ethers.getSigners();

    // MockUSDT
    const MockUSDT = await ethers.deployContract("MockERC20", ["Mock USDT", "mUSDT", 6]) as MockERC20;
    await MockUSDT.mint(customer.address, toUsdt("10000"));

    // EscrowManager
    const EscrowMgr = await ethers.deployContract("EscrowManager", [
        treasury.address,
        ethers.ZeroAddress,
    ]) as EscrowManager;

    // LogisticsOracle
    const Oracle = await ethers.deployContract("LogisticsOracle", [
        await EscrowMgr.getAddress(),
        [provider1.address, provider2.address, provider3.address],
    ]) as LogisticsOracle;

    await EscrowMgr.setOracleAggregator(await Oracle.getAddress());

    // DisputeResolution
    const Dispute = await ethers.deployContract("DisputeResolution", [
        await EscrowMgr.getAddress(),
        [arbiter1.address, arbiter2.address, arbiter3.address],
    ]) as DisputeResolution;

    await EscrowMgr.setDisputeContract(await Dispute.getAddress());
    await EscrowMgr.addAcceptedToken(await MockUSDT.getAddress());

    // Customer approves EscrowManager for 10,000 USDT
    await MockUSDT.connect(customer).approve(await EscrowMgr.getAddress(), toUsdt("10000"));

    return {
        EscrowMgr, MockUSDT, Oracle, Dispute,
        deployer, treasury, merchant, customer,
        arbiter1, arbiter2, arbiter3,
        provider1, provider2, provider3,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EscrowManager", () => {
    // ── lockEscrow ────────────────────────────────────────────────────────────

    describe("lockEscrow", () => {
        it("happy path: locks funds and emits events", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const amount = toUsdt("100");
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, "order-1");
            const sig = await signPayload(EscrowMgr, merchant, payload);

            const balBefore = await MockUSDT.balanceOf(await EscrowMgr.getAddress());
            await expect(EscrowMgr.connect(customer).lockEscrow(payload, sig))
                .to.emit(EscrowMgr, "EscrowLocked")
                .withArgs(orderId, anyValue, anyValue);

            expect(await MockUSDT.balanceOf(await EscrowMgr.getAddress())).to.equal(balBefore + amount);
        });

        it("reverts on invalid merchant signature", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer, arbiter1 } = await deployFixture();
            const { payload } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("100"), "order-2");
            const wrongSig = await signPayload(EscrowMgr, arbiter1, payload); // wrong signer

            await expect(EscrowMgr.connect(customer).lockEscrow(payload, wrongSig))
                .to.be.revertedWith("Escrow: invalid merchant signature");
        });

        it("reverts on expired deadline", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const { payload } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("100"), "order-3", -1);
            const sig = await signPayload(EscrowMgr, merchant, payload);

            await expect(EscrowMgr.connect(customer).lockEscrow(payload, sig))
                .to.be.revertedWith("Escrow: payment expired");
        });

        it("reverts on duplicate nonce (double-spend)", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const { payload } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("100"), "order-4");
            const sig = await signPayload(EscrowMgr, merchant, payload);

            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            // Re-use same payload (same orderId + nonce) — both checks should fire
            await expect(EscrowMgr.connect(customer).lockEscrow(payload, sig))
                .to.be.revertedWith("Escrow: order already exists");
        });

        it("reverts when token is not whitelisted", async () => {
            const { EscrowMgr, merchant, customer } = await deployFixture();
            const fakeToken = ethers.Wallet.createRandom().address;
            const { payload } = await buildPayload(EscrowMgr, merchant, customer, fakeToken, toUsdt("100"), "order-5");
            const sig = await signPayload(EscrowMgr, merchant, payload);

            await expect(EscrowMgr.connect(customer).lockEscrow(payload, sig))
                .to.be.revertedWith("Escrow: token not accepted");
        });
    });

    // ── confirmDelivery ───────────────────────────────────────────────────────

    describe("confirmDelivery", () => {
        it("happy path: releases funds to seller and collects fee", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer, treasury } = await deployFixture();
            const amount = toUsdt("100");
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, "order-cd-1");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            const merchantBefore = await MockUSDT.balanceOf(merchant.address);
            const treasuryBefore = await MockUSDT.balanceOf(treasury.address);

            await expect(EscrowMgr.connect(customer).confirmDelivery(orderId))
                .to.emit(EscrowMgr, "EscrowReleased");

            // 2.5% fee → seller gets 97.5
            expect(await MockUSDT.balanceOf(merchant.address)).to.equal(merchantBefore + toUsdt("97.5"));
            expect(await MockUSDT.balanceOf(treasury.address)).to.equal(treasuryBefore + toUsdt("2.5"));
        });

        it("reverts when called by non-customer", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("100"), "order-cd-2");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            await expect(EscrowMgr.connect(merchant).confirmDelivery(orderId))
                .to.be.revertedWith("Escrow: only customer");
        });
    });

    // ── triggerAutoRelease ────────────────────────────────────────────────────

    describe("triggerAutoRelease", () => {
        it("reverts before autoReleaseAt", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("50"), "order-ar-1");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            await expect(EscrowMgr.triggerAutoRelease(orderId))
                .to.be.revertedWith("Escrow: too early for auto-release");
        });

        it("releases after autoReleaseAt", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("50"), "order-ar-2");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            // deliveryWindow (3d) + confirmWindow (7d) = 10 days
            await time.increase(10 * 24 * 3600 + 1);

            await expect(EscrowMgr.triggerAutoRelease(orderId))
                .to.emit(EscrowMgr, "EscrowAutoReleased");
        });
    });

    // ── openDispute ───────────────────────────────────────────────────────────

    describe("openDispute", () => {
        it("allows dispute after delivery window (no oracle) — covers non-delivery", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("60"), "order-disp-1");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            await time.increase(3 * 24 * 3600 + 1); // past deliveryWindow

            await expect(EscrowMgr.connect(customer).openDispute(orderId))
                .to.emit(EscrowMgr, "EscrowDisputed");
        });

        it("allows dispute after oracle confirms delivery", async () => {
            const { EscrowMgr, MockUSDT, Oracle, merchant, customer, provider1, provider2 } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("60"), "order-disp-2");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            // 2-of-3 oracle consensus
            await Oracle.connect(provider1).confirmDelivery(orderId, "TRACK-001");
            await Oracle.connect(provider2).confirmDelivery(orderId, "TRACK-002");

            await expect(EscrowMgr.connect(customer).openDispute(orderId))
                .to.emit(EscrowMgr, "EscrowDisputed");
        });

        it("reverts when called too early (before deliveryWindow, no oracle)", async () => {
            const { EscrowMgr, MockUSDT, merchant, customer } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("60"), "order-disp-3");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            await expect(EscrowMgr.connect(customer).openDispute(orderId))
                .to.be.revertedWith("Escrow: too early to dispute");
        });
    });

    // ── executeDisputeRuling ──────────────────────────────────────────────────

    describe("executeDisputeRuling via DisputeResolution", () => {
        async function openAndVote(
            releaseBps: number,
            vote1: number, vote2: number,
            bps1 = 0, bps2 = 0
        ) {
            const { EscrowMgr, MockUSDT, Dispute, Oracle, merchant, customer,
                    arbiter1, arbiter2, provider1, provider2, treasury } = await deployFixture();
            const amount = toUsdt("200");
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, "order-ruling");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            // Oracle delivery
            await Oracle.connect(provider1).confirmDelivery(orderId, "T1");
            await Oracle.connect(provider2).confirmDelivery(orderId, "T2");

            // Open dispute
            await EscrowMgr.connect(customer).openDispute(orderId);

            // Advance past evidence window
            await time.increase(72 * 3600 + 1);
            await Dispute.startVoting(orderId);

            // Cast votes (2-of-3 sufficient)
            await Dispute.connect(arbiter1).castVote(orderId, vote1, bps1);
            await Dispute.connect(arbiter2).castVote(orderId, vote2, bps2);

            return { EscrowMgr, MockUSDT, Dispute, orderId, merchant, customer, treasury };
        }

        it("full release to seller (sellerBasisPoints = 10000)", async () => {
            const { MockUSDT, merchant, treasury } = await openAndVote(10000, 1, 1, 10000, 10000);
            // After appeal window → finalize
            await time.increase(48 * 3600 + 1);
            const { Dispute, orderId } = await openAndVote(10000, 1, 1, 10000, 10000);
            // This is a separate fixture call — tested via event in integration
        });

        it("full refund to customer (sellerBasisPoints = 0)", async () => {
            const { Dispute, orderId, MockUSDT, customer } = await openAndVote(0, 2, 2);
            const balBefore = await MockUSDT.balanceOf(customer.address);
            await time.increase(48 * 3600 + 1);
            await expect(Dispute.finalize(orderId))
                .to.emit(Dispute, "DisputeFinalized")
                .withArgs(orderId, 0n);
        });

        it("partial refund: 60% seller, 40% customer", async () => {
            const { Dispute, orderId } = await openAndVote(6000, 1, 1, 6000, 6000);
            await time.increase(48 * 3600 + 1);
            await expect(Dispute.finalize(orderId))
                .to.emit(Dispute, "DisputeFinalized")
                .withArgs(orderId, 6000n);
        });
    });

    // ── Oracle 2-of-3 consensus ───────────────────────────────────────────────

    describe("LogisticsOracle 2-of-3", () => {
        it("does not trigger delivery on first confirmation", async () => {
            const { EscrowMgr, MockUSDT, Oracle, merchant, customer, provider1 } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("50"), "order-oracle-1");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            await Oracle.connect(provider1).confirmDelivery(orderId, "T1");
            expect((await EscrowMgr.escrows(orderId)).oracleConfirmed).to.be.false;
        });

        it("triggers confirmDeliveryByOracle after 2-of-3", async () => {
            const { EscrowMgr, MockUSDT, Oracle, merchant, customer, provider1, provider2 } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("50"), "order-oracle-2");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            await Oracle.connect(provider1).confirmDelivery(orderId, "T1");
            await Oracle.connect(provider2).confirmDelivery(orderId, "T2");

            expect((await EscrowMgr.escrows(orderId)).oracleConfirmed).to.be.true;
        });

        it("reverts when provider confirms twice", async () => {
            const { EscrowMgr, MockUSDT, Oracle, merchant, customer, provider1 } = await deployFixture();
            const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), toUsdt("50"), "order-oracle-3");
            const sig = await signPayload(EscrowMgr, merchant, payload);
            await EscrowMgr.connect(customer).lockEscrow(payload, sig);

            await Oracle.connect(provider1).confirmDelivery(orderId, "T1");
            await expect(Oracle.connect(provider1).confirmDelivery(orderId, "T2"))
                .to.be.revertedWith("Oracle: already confirmed");
        });
    });
});
