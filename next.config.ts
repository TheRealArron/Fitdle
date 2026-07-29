import type { NextConfig } from 'next';

/**
 * `BUILD_TARGET=extension` switches on the static export used by
 * `npm run build:extension`. The default web build stays a normal Next build so
 * `next start` and server deploys keep working.
 */
const isExtension = process.env.BUILD_TARGET === 'extension';

const nextConfig: NextConfig = {
  ...(isExtension
    ? {
        output: 'export' as const,
        // No optimisation server exists behind a static export.
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
