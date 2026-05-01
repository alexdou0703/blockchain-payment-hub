/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@payment-hub/shared'],
  typescript: { ignoreBuildErrors: false },
};
module.exports = nextConfig;
