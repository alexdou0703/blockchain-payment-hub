import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "fs";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
    EscrowManager,
    MockERC20,
    DisputeResolution,
    LogisticsOracle,
    SettlementContract,
} from "../typechain-types";

// ─── Constants ────────────────────────────────────────────────────────────────

const USDT_DECIMALS = 6n;
const toUsdt = (amount: string) => ethers.parseUnits(amount, USDT_DECIMALS);
const SAMPLES = 5;
const GAS_REPORT_PATH = "/tmp/gas-report.json";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GasSample {
    operation: string;
    min: number;
    avg: number;
    max: number;
    samples: number[];
}

interface GasReport {
    timestamp: string;
    network: string;
    results: GasSample[];
}

// ─── Deployment helpers ───────────────────────────────────────────────────────

/**
 * Deploy a fresh set of contracts for each sample run so state is truly fresh.
 */
async function deployAll() {
    const [deployer, treasury, merchant, customer,
           arbiter1, arbiter2, arbiter3,
           provider1, provider2, provider3] = await ethers.getSigners();

    // MockERC20
    const MockUSDT = await ethers.deployContract("MockERC20", ["Mock USDT", "mUSDT", 6]) as MockERC20;
    await MockUSDT.mint(customer.address, toUsdt("100000"));

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

    // Customer approves a large allowance up front
    await MockUSDT.connect(customer).approve(await EscrowMgr.getAddress(), toUsdt("100000"));

    // SettlementContract — sequencer = deployer
    const Settlement = await ethers.deployContract("SettlementContract", [
        deployer.address,
    ]) as SettlementContract;

    return {
        MockUSDT, EscrowMgr, Oracle, Dispute, Settlement,
        deployer, treasury, merchant, customer,
        arbiter1, arbiter2, arbiter3,
        provider1, provider2, provider3,
    };
}

// ─── EIP-712 helpers ──────────────────────────────────────────────────────────

async function buildPayload(
    escrow: EscrowManager,
    merchant: SignerWithAddress,
    customer: SignerWithAddress,
    token: string,
    amount: bigint,
    platformOrderId: string,
    deadlineOffset = 1800,
) {
    const nonce    = ethers.hexlify(ethers.randomBytes(32));
    const deadline = BigInt(await time.latest()) + BigInt(deadlineOffset);
    const orderId  = ethers.keccak256(ethers.toUtf8Bytes(platformOrderId));
    return {
        payload: { merchant: merchant.address, customer: customer.address, amount, orderId, nonce, deadline, token },
        orderId,
    };
}

async function signPayload(
    escrow: EscrowManager,
    signer: SignerWithAddress,
    payload: {
        merchant: string; customer: string; amount: bigint;
        orderId: string; nonce: string; deadline: bigint; token: string;
    },
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

// ─── Gas measurement utility ──────────────────────────────────────────────────

async function getGas(txPromise: Promise<any>): Promise<number> {
    const tx       = await txPromise;
    const receipt  = await tx.wait();
    return Number(receipt.gasUsed);
}

// ─── Individual operation samplers ───────────────────────────────────────────

/** lockEscrow: customer locks funds for a fresh order each run */
async function sampleLockEscrow(): Promise<number[]> {
    const gases: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const { EscrowMgr, MockUSDT, merchant, customer } = await deployAll();
        const amount = toUsdt("100");
        const { payload } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, `lock-${i}-${Date.now()}`);
        const sig = await signPayload(EscrowMgr, merchant, payload);
        gases.push(await getGas(EscrowMgr.connect(customer).lockEscrow(payload, sig)));
    }
    return gases;
}

/** confirmDelivery: lock then confirm */
async function sampleConfirmDelivery(): Promise<number[]> {
    const gases: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const { EscrowMgr, MockUSDT, merchant, customer } = await deployAll();
        const amount = toUsdt("100");
        const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, `cd-${i}-${Date.now()}`);
        const sig = await signPayload(EscrowMgr, merchant, payload);
        await EscrowMgr.connect(customer).lockEscrow(payload, sig);
        gases.push(await getGas(EscrowMgr.connect(customer).confirmDelivery(orderId)));
    }
    return gases;
}

/** triggerAutoRelease: lock, advance time past autoRelease window, then trigger */
async function sampleTriggerAutoRelease(): Promise<number[]> {
    const gases: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const { EscrowMgr, MockUSDT, merchant, customer } = await deployAll();
        const amount = toUsdt("100");
        const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, `ar-${i}-${Date.now()}`);
        const sig = await signPayload(EscrowMgr, merchant, payload);
        await EscrowMgr.connect(customer).lockEscrow(payload, sig);
        // deliveryWindow (3d) + confirmWindow (7d) = 10 days
        await time.increase(10 * 24 * 3600 + 1);
        gases.push(await getGas(EscrowMgr.triggerAutoRelease(orderId)));
    }
    return gases;
}

/** openDispute: lock, advance past deliveryWindow, open dispute */
async function sampleOpenDispute(): Promise<number[]> {
    const gases: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const { EscrowMgr, MockUSDT, merchant, customer } = await deployAll();
        const amount = toUsdt("100");
        const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, `disp-${i}-${Date.now()}`);
        const sig = await signPayload(EscrowMgr, merchant, payload);
        await EscrowMgr.connect(customer).lockEscrow(payload, sig);
        await time.increase(3 * 24 * 3600 + 1);
        gases.push(await getGas(EscrowMgr.connect(customer).openDispute(orderId)));
    }
    return gases;
}

/**
 * executeDisputeRuling: full path — lock, oracle confirm, open dispute,
 * advance past evidence window, vote 2-of-3, advance past appeal window, finalize.
 * We measure the finalize() call which calls executeDisputeRuling internally.
 */
async function sampleExecuteDisputeRuling(): Promise<number[]> {
    const gases: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const { EscrowMgr, MockUSDT, Oracle, Dispute, merchant, customer,
                arbiter1, arbiter2, provider1, provider2 } = await deployAll();
        const amount = toUsdt("100");
        const { payload, orderId } = await buildPayload(EscrowMgr, merchant, customer, await MockUSDT.getAddress(), amount, `ruling-${i}-${Date.now()}`);
        const sig = await signPayload(EscrowMgr, merchant, payload);
        await EscrowMgr.connect(customer).lockEscrow(payload, sig);

        // Oracle 2-of-3 consensus
        await Oracle.connect(provider1).confirmDelivery(orderId, "TRACK-A");
        await Oracle.connect(provider2).confirmDelivery(orderId, "TRACK-B");

        // Open dispute
        await EscrowMgr.connect(customer).openDispute(orderId);

        // Advance past evidence window (72h) and start voting
        await time.increase(72 * 3600 + 1);
        await Dispute.startVoting(orderId);

        // 2-of-3 votes — full release to seller (10000 bps)
        await Dispute.connect(arbiter1).castVote(orderId, 1, 10000);
        await Dispute.connect(arbiter2).castVote(orderId, 1, 10000);

        // Advance past appeal window (48h) then finalize
        await time.increase(48 * 3600 + 1);
        gases.push(await getGas(Dispute.finalize(orderId)));
    }
    return gases;
}

/** approve (ERC20): simple ERC20 approve call */
async function sampleApprove(): Promise<number[]> {
    const gases: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const { MockUSDT, EscrowMgr, customer } = await deployAll();
        // Reset allowance to 0 then measure the approve
        await MockUSDT.connect(customer).approve(await EscrowMgr.getAddress(), 0n);
        gases.push(await getGas(MockUSDT.connect(customer).approve(await EscrowMgr.getAddress(), toUsdt("1000"))));
    }
    return gases;
}

/** commitBatch (SettlementLayer): sequencer commits a batch */
async function sampleCommitBatch(): Promise<number[]> {
    const gases: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const { Settlement, deployer } = await deployAll();
        const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`batch-${i}-${Date.now()}`));
        gases.push(await getGas(Settlement.connect(deployer).commitBatch(merkleRoot, 10n, `ipfs://Qm${i}`)));
    }
    return gases;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function computeStats(samples: number[]): { min: number; avg: number; max: number } {
    const sorted = [...samples].sort((a, b) => a - b);
    const min    = sorted[0];
    const max    = sorted[sorted.length - 1];
    const avg    = Math.round(samples.reduce((s, x) => s + x, 0) / samples.length);
    return { min, avg, max };
}

// ─── Table printer ────────────────────────────────────────────────────────────

function printTable(results: GasSample[]): void {
    const COL = {
        op:  30,
        min: 12,
        avg: 12,
        max: 12,
    };
    const sep = "-".repeat(COL.op + COL.min + COL.avg + COL.max + 13);
    const pad = (s: string | number, w: number) => String(s).padStart(w);
    const padL = (s: string, w: number) => s.padEnd(w);

    console.log("\n" + sep);
    console.log(
        `| ${padL("Operation", COL.op)} | ${pad("Min Gas", COL.min)} | ${pad("Avg Gas", COL.avg)} | ${pad("Max Gas", COL.max)} |`
    );
    console.log(sep);
    for (const r of results) {
        console.log(
            `| ${padL(r.operation, COL.op)} | ${pad(r.min, COL.min)} | ${pad(r.avg, COL.avg)} | ${pad(r.max, COL.max)} |`
        );
    }
    console.log(sep + "\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const network = (await ethers.provider.getNetwork()).name;
    console.log(`\nMeasuring gas on network: ${network} (${SAMPLES} samples each)\n`);

    // Each entry: [operation label, sampler function]
    const tasks: [string, () => Promise<number[]>][] = [
        ["approve (ERC20)",       sampleApprove],
        ["lockEscrow",            sampleLockEscrow],
        ["confirmDelivery",       sampleConfirmDelivery],
        ["triggerAutoRelease",    sampleTriggerAutoRelease],
        ["openDispute",           sampleOpenDispute],
        ["executeDisputeRuling",  sampleExecuteDisputeRuling],
        ["commitBatch (Settlement)", sampleCommitBatch],
    ];

    const results: GasSample[] = [];

    for (const [operation, sampler] of tasks) {
        process.stdout.write(`  Sampling "${operation}"... `);
        const samples = await sampler();
        const { min, avg, max } = computeStats(samples);
        results.push({ operation, min, avg, max, samples });
        console.log(`done  (avg: ${avg})`);
    }

    // Print table to stdout
    printTable(results);

    // Write JSON report
    const report: GasReport = {
        timestamp: new Date().toISOString(),
        network:   "hardhat",
        results,
    };

    fs.writeFileSync(GAS_REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`Gas report written to ${GAS_REPORT_PATH}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
