/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  httpAgentOptions: {
    keepAlive: true,
  },
}
module.exports = nextConfig
