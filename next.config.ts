import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Token logos ingested from CoinGecko (tokens.coingecko_image)
    remotePatterns: [
      { protocol: 'https', hostname: 'coin-images.coingecko.com' },
      { protocol: 'https', hostname: 'assets.coingecko.com' },
    ],
  },
}

export default nextConfig
