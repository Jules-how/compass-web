import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/delivery-dept/**/*': ['./src/lib/delivery-dept/*.json']
  },
  reactStrictMode: true,
  transpilePackages: ['@switchflow/compass-core'],
  // Keep the Next.js badge off the sidebar Sign out control.
  devIndicators: {
    position: 'bottom-right'
  },
  // Next 15 defaults dynamic staleTime to 0, so every Home ↔ Inbox click
  // re-fetches RSC (middleware auth + layout). Reuse the client router cache
  // briefly so back-and-forth feels instant; keep-alive covers the panels.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180
    },
    optimizePackageImports: ['lucide-react', 'framer-motion', 'recharts']
  }
}

export default nextConfig
