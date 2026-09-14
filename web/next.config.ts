import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // The access token is in the path, so the path must never travel in a
          // Referer header. Today no page here loads anything external, so
          // nothing would send one; this is here so that adding a font, an
          // image or an outbound link later cannot quietly hand someone's
          // private link to another site.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // These links are private and there is no login behind them.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
