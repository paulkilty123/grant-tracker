const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
    // Include the MCP ToS markdown in the deployed bundle so route handlers
    // (issuance flow, /mcp/terms page) can fs.readFile it at runtime.
    // In Next 14, this option lives under `experimental`. (Moved to top level
    // in Next 15.)
    outputFileTracingIncludes: {
      '/api/mcp/keys/issue':       ['./docs/legal/mcp-tos.md'],
      '/mcp/terms':                ['./docs/legal/mcp-tos.md'],
      '/dashboard/mcp/keys/new':   ['./docs/legal/mcp-tos.md'],
    },
  },
}
export default nextConfig
