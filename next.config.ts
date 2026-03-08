import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0',
  },
  async headers() {
    // CSP: allow self, blob: for file previews, inline styles (Tailwind),
    // and frame-src for blob: PDF previews + http/https panel embeds
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",      // Next.js requires inline scripts
      "style-src 'self' 'unsafe-inline'",        // Tailwind + inline styles
      "img-src 'self' blob: data:",              // blob: for file previews, data: for icons
      "font-src 'self'",                         // next/font self-hosted
      "connect-src 'self' ws: wss:",             // WebSocket for terminal proxy
      "frame-src blob: http: https:",            // blob: for PDF, http/https for panel embeds
      "object-src 'none'",                       // block plugins
      "base-uri 'self'",                         // prevent base tag injection
      "form-action 'self'",                      // restrict form submissions
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
