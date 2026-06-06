'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy-loaded wrapper around `MaintenancePage`.
 *
 * The maintenance splash is ~310 LOC of decorative motion/SVG that is only ever
 * shown when `NEXT_PUBLIC_MAINTENANCE_MODE === 'true'` (a rare, deploy-time
 * toggle). Importing it eagerly shipped all of that weight in the main bundle on
 * every page load. `dynamic(..., { ssr: false })` splits it into its own chunk
 * that is only fetched when the app-shell actually renders maintenance mode.
 *
 * See ReviewAgents-findings-2026-05-20 P3-6.
 */
export const MaintenancePage = dynamic(
  () => import('./maintenance-page').then((m) => m.MaintenancePage),
  { ssr: false },
);
