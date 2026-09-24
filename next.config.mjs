/** @type {import("next").NextConfig} */
const nextConfig = { experimental: { serverComponentsExternalPackages: ["openai", "n8n-workflow"] } };
export default nextConfig;
