const nextConfig = {
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
      dynamic: 0,  // never serve stale HTML for dynamic pages
    },
  },
}
export default nextConfig
