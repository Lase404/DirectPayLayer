/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'raw.githubusercontent.com',
      'cdn.jsdelivr.net',
      'assets.coingecko.com',
      'tokens.1inch.io',
      'flagcdn.com',
      'ethereum-optimism.github.io',
      'crossbow.noblocks.xyz'
    ],
  }
}

module.exports = nextConfig; 