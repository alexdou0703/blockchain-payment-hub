/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@payment-hub/shared'],
  typescript: { ignoreBuildErrors: false },
};
module.exports = nextConfig;
