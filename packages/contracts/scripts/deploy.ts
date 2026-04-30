import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// FIX (vs original plan):
// - Correct deploy ORDER: EscrowManager before LogisticsOracle (oracle needs
//   escrow address; original plan had it backwards with a broken "getter" call
//   masquerading as a setter).
// - Added setEscrowManager() call on LogisticsOracle (new function).
// - Defined treasury / provider / arbiter signers from getSigners().
// - MockERC20 now has a mint() call so test accounts have tokens.
// - Saves all addresses to shared/constants/addresses.json for backend use.

async function main() {
    const signers = await ethers.getSigners();
    const deployer   = signers[0];
    const treasury   = signers[1];
    const provider1  = signers[2];  // mock GHN
    const provider2  = signers[3];  // mock GHTK
    const provider3  = signers[4];  // mock Viettel Post
    const arbiter1   = signers[5];
    const arbiter2   = signers[6];
    const arbiter3   = signers[7];
    const customer   = signers[8];
    const merchant   = signers[9];

    console.log("Deploying with:", deployer.address);
    console.log("Network:", (await ethers.provider.getNetwork()).name);

    // ── 1. Mock USDT (6 decimals, same as real USDT) ─────────────────────────
    const MockUSDT = await ethers.deployContract("MockERC20", ["Mock USDT", "mUSDT", 6]);
    await MockUSDT.waitForDeployment();
    console.log("MockUSDT deployed:", MockUSDT.target);

    // Mint 10,000 mUSDT to test customer
    await MockUSDT.mint(customer.address, ethers.parseUnits("10000", 6));
    console.log("Minted 10,000 mUSDT to customer:", customer.address);

    // ── 2. EscrowManager ─────────────────────────────────────────────────────
    // Deployed BEFORE LogisticsOracle so we have a real address to pass.
    // oracleAggregator is set to ZeroAddress here; wired below via setOracleAggregator().
    const EscrowManager = await ethers.deployContract("EscrowManager", [
        treasury.address,
        ethers.ZeroAddress,  // oracle — set after LogisticsOracle is deployed
    ]);
    await EscrowManager.waitForDeployment();
    console.log("EscrowManager deployed:", EscrowManager.target);

    // ── 3. LogisticsOracle ───────────────────────────────────────────────────
    // Deployed with the real EscrowManager address.
    const LogisticsOracle = await ethers.deployContract("LogisticsOracle", [
        EscrowManager.target,
        [provider1.address, provider2.address, provider3.address],
    ]);
    await LogisticsOracle.waitForDeployment();
    console.log("LogisticsOracle deployed:", LogisticsOracle.target);

    // ── 4. Wire EscrowManager ↔ LogisticsOracle ───────────────────────────────
    await (await EscrowManager.setOracleAggregator(LogisticsOracle.target)).wait();
    console.log("EscrowManager.oracleAggregator set to LogisticsOracle");

    // ── 5. DisputeResolution ─────────────────────────────────────────────────
    const DisputeResolution = await ethers.deployContract("DisputeResolution", [
        EscrowManager.target,
        [arbiter1.address, arbiter2.address, arbiter3.address],
    ]);
    await DisputeResolution.waitForDeployment();
    console.log("DisputeResolution deployed:", DisputeResolution.target);

    // ── 6. Wire EscrowManager ↔ DisputeResolution ────────────────────────────
    await (await EscrowManager.setDisputeContract(DisputeResolution.target)).wait();
    console.log("EscrowManager.disputeContract set to DisputeResolution");

    // ── 7. SettlementContract (L1 anchor) ─────────────────────────────────────
    // Sequencer = deployer for testnet; replace with a dedicated hot wallet in prod.
    const SettlementContract = await ethers.deployContract("SettlementContract", [
        deployer.address,
    ]);
    await SettlementContract.waitForDeployment();
    console.log("SettlementContract deployed:", SettlementContract.target);

    // ── 8. Whitelist mUSDT in EscrowManager ──────────────────────────────────
    await (await EscrowManager.addAcceptedToken(MockUSDT.target)).wait();
    console.log("MockUSDT whitelisted in EscrowManager");

    // ── Save addresses ────────────────────────────────────────────────────────
    const addresses = {
        MockUSDT:          MockUSDT.target,
        EscrowManager:     EscrowManager.target,
        LogisticsOracle:   LogisticsOracle.target,
        DisputeResolution: DisputeResolution.target,
        SettlementContract: SettlementContract.target,
        // Test accounts (for scripts / frontend .env)
        treasury:  treasury.address,
        provider1: provider1.address,
        provider2: provider2.address,
        provider3: provider3.address,
        arbiter1:  arbiter1.address,
        arbiter2:  arbiter2.address,
        arbiter3:  arbiter3.address,
        customer:  customer.address,
        merchant:  merchant.address,
    };

    const outDir = path.join(__dirname, "../../shared/constants");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, "addresses.json"),
        JSON.stringify(addresses, null, 2)
    );
    console.log("\nAddresses saved to packages/shared/constants/addresses.json");
    console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
