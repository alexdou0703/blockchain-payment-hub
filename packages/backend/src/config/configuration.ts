/** Application configuration factory — loaded by ConfigModule */
export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/payment_hub',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  blockchain: {
    sepoliaRpc: process.env.SEPOLIA_RPC_URL || '',
    sepoliaWs: process.env.SEPOLIA_WS_URL || '',
    deployerKey: process.env.DEPLOYER_PRIVATE_KEY || '',
    escrowAddress: process.env.ESCROW_CONTRACT_ADDRESS || '',
    disputeAddress: process.env.DISPUTE_CONTRACT_ADDRESS || '',
    oracleAddress: process.env.ORACLE_CONTRACT_ADDRESS || '',
    settlementAddress: process.env.SETTLEMENT_CONTRACT_ADDRESS || '',
    usdtAddress: process.env.USDT_ADDRESS || '',
    treasuryAddress: process.env.TREASURY_ADDRESS || '',
  },
});
