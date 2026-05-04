/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@payment-hub/shared'],
  typescript: { ignoreBuildErrors: false },
  experimental: { instrumentationHook: true },
  // Keep WalletConnect / RainbowKit / wagmi out of the SSR bundle —
  // they access browser-only globals (indexedDB, localStorage) at import time.
  serverExternalPackages: [
    '@walletconnect/core',
    '@walletconnect/universal-provider',
    '@walletconnect/ethereum-provider',
    '@rainbow-me/rainbowkit',
    'wagmi',
    '@wagmi/core',
    '@wagmi/connectors',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, indexedDB: false };
    }
    return config;
  },
};
module.exports = nextConfig;
