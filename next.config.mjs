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
  // First-party proxy for the self-hosted Umami analytics app, so the tracker
  // is served from our own domain and isn't blocked by adblockers. Set
  // UMAMI_APP_URL to the deployed Umami URL (e.g. https://<project>-umami.vercel.app).
  // The script is loaded as /o/script.js; events post to /api/send or
  // /o/api/send depending on how the tracker derives its endpoint — both are
  // proxied so it works either way. No rewrites are added until the env is set.
  async rewrites() {
    const umami = process.env.UMAMI_APP_URL?.replace(/\/$/, '')
    if (!umami) return []
    return [
      { source: '/o/script.js',  destination: `${umami}/script.js` },
      { source: '/o/api/send',   destination: `${umami}/api/send` },
      { source: '/api/send',     destination: `${umami}/api/send` },
    ]
  },
}
export default nextConfig
