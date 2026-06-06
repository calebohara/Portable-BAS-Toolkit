import type { NextConfig } from "next";
import pkg from "./package.json";

const isStaticExport = process.env.TAURI_BUILD === '1';

// Prefer the npm-injected version, but fall back to reading package.json
// directly so non-npm builds (e.g. `next build` via pnpm/docker) still get the
// real version instead of labeling everything as '1.0.0'.
const appVersion = process.env.npm_package_version || pkg.version || '1.0.0';

const nextConfig: NextConfig = {
  // Static export for Tauri desktop builds
  ...(isStaticExport ? {
    output: 'export',
    // Rewrite dynamic routes to use catch-all pattern for static export
    trailingSlash: true,
  } : {}),

  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },

  // Security headers (only apply in server mode, not static export)
  ...(!isStaticExport ? {
    async headers() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co';
      const supabaseWs = supabaseUrl.replace('https://', 'wss://');

      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data: https://*.supabase.co",
        "font-src 'self' data:",
        `connect-src 'self' ${supabaseWs} https://api.github.com https://*.supabase.co https://api.stripe.com`,
        "frame-src 'self' https://js.stripe.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://checkout.stripe.com",
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
