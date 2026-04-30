export default () => ({
  port: parseInt(process.env.PORT ?? '3002', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  blockchain: {
    sepoliaRpc: process.env.SEPOLIA_RPC_URL ?? '',
    oracleAddress: process.env.LOGISTICS_ORACLE_ADDRESS ?? '',
    ghnKey: process.env.GHN_PRIVATE_KEY ?? '',
    ghtkKey: process.env.GHTK_PRIVATE_KEY ?? '',
    viettelKey: process.env.VIETTEL_PRIVATE_KEY ?? '',
  },
  backendApiUrl: process.env.BACKEND_API_URL ?? 'http://localhost:3001',
});
