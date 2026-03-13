import type { NextConfig } from "next";

const isStaticExport = process.env.TAURI_BUILD === '1';

const nextConfig: NextConfig = {
  // Static export for Tauri desktop builds
  ...(isStaticExport ? {
    output: 'export',
    // Rewrite dynamic routes to use catch-all pattern for static export
    trailingSlash: true,
  } : {}),

  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0',
  },

  // Security headers (only apply in server mode, not static export)
  ...(!isStaticExport ? {
    async headers() {
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        "connect-src 'self' ws: wss: https://api.github.com https://*.supabase.co https://api.stripe.com",
        "frame-src blob: http: https:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
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
  } : {}),
};

export default nextConfig;
