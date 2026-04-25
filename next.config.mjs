// build-cache-bust: 2026-04-25
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
  },
}
export default nextConfig
