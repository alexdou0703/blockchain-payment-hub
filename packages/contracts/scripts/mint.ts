import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const USDT_ADDRESS  = "0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0";
    const RECIPIENT     = "0x160F267cEF249Ced05c30e32172E9420E8Ad1EC8";
    const AMOUNT        = ethers.parseUnits("10000000000", 6); // 10 billion mUSDT

    const usdt = await ethers.getContractAt("MockERC20", USDT_ADDRESS, deployer);
    console.log("Minting 10,000,000,000 mUSDT to", RECIPIENT, "...");
    const tx = await usdt.mint(RECIPIENT, AMOUNT);
    await tx.wait();
    console.log("Tx:", tx.hash);

    const bal = await usdt.balanceOf(RECIPIENT);
    console.log("New balance:", ethers.formatUnits(bal, 6), "mUSDT");
}

main().catch(err => { console.error(err); process.exit(1); });
