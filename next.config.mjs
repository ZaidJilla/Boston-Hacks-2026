/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // small Docker image for Cloud Run
  experimental: {
    serverComponentsExternalPackages: ["@mastra/core", "pg", "firebase-admin"],
  },
};
export default nextConfig;
