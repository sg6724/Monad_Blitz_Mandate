import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@taskpay/sdk'],
  async rewrites() {
    return [{ source: '/.well-known/taskpay.json', destination: '/api/well-known' }];
  },
};

export default config;
