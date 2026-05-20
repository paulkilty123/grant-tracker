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
      '/mcp/keys/new':             ['./docs/legal/mcp-tos.md'],
    },
  },
  async redirects() {
    return [
      { source: '/dashboard/mcp/keys',     destination: '/mcp/keys',     permanent: true },
      { source: '/dashboard/mcp/keys/new', destination: '/mcp/keys/new', permanent: true },
      { source: '/dashboard/mcp/:path*',   destination: '/mcp/:path*',   permanent: true },
    ]
  },
}
export default nextConfig
