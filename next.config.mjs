/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // small Docker image for Cloud Run
  experimental: {
    serverComponentsExternalPackages: ["@solana/web3.js", "@mastra/core", "pg", "firebase-admin"],
  },
};
export default nextConfig;
