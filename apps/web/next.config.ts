import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  async rewrites() {
    return [
      {
        source: '/v1/platform/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:3001'}/v1/platform/:path*`,
      },
      {
        source: '/api-reference',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:3001'}/docs`,
      },
      {
        source: '/openapi.json',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:3001'}/openapi.json`,
      },
      {
        source: '/api/auth/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:3001'}/api/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
