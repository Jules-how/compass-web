import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@switchflow/compass-core'],
  // Keep the Next.js badge off the sidebar Sign out control.
  devIndicators: {
    position: 'bottom-right'
  }
}

export default nextConfig
