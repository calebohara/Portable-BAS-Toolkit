/**
 * Stripe configuration and donation tier definitions.
 *
 * ─── Required Environment Variables ───────────────────────────
 *
 * Server-only (NEVER expose to client):
 *   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET      — whsec_... (for webhook signature verification)
 *
 * Client-safe (NEXT_PUBLIC_ prefix):
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — pk_live_... or pk_test_...
 *   NEXT_PUBLIC_APP_URL                — https://your-domain.com (for redirect URLs)
 *
 * ─── Where to Set These ───────────────────────────────────────
 *
 * Add to .env.local:
 *   STRIPE_SECRET_KEY=sk_live_YOUR_KEY
 *   STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY
 *   NEXT_PUBLIC_APP_URL=https://bausuite.com
 */

// ─── Configuration ──────────────────────────────────────────────

/** Whether Stripe is fully configured and ready for live payments.
 *  Only checks the publishable key since this runs client-side where
 *  STRIPE_SECRET_KEY (non-NEXT_PUBLIC_) is not available. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

/** Publishable key — safe for client-side use */
export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

/** Base URL for success/cancel redirects */
export const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// ─── Donation Tiers ─────────────────────────────────────────────

export type DonationMode = 'one_time' | 'monthly';

export interface DonationTier {
  /** Amount in cents (e.g. 500 = $5.00) */
  amount: number;
  /** Display label */
  label: string;
  /** Tier name */
  name: string;
  /** Short description */
  description: string;
  /** Whether this tier is visually highlighted */
  featured?: boolean;
}

export const ONE_TIME_TIERS: DonationTier[] = [
  { amount: 500, label: '$5', name: 'Supporter', description: 'Buy the developer a coffee' },
  { amount: 1500, label: '$15', name: 'Contributor', description: 'Help cover hosting costs' },
  { amount: 2500, label: '$25', name: 'Advocate', description: 'Fund a new feature sprint', featured: true },
  { amount: 5000, label: '$50', name: 'Champion', description: 'Accelerate platform development' },
];

export const MONTHLY_TIERS: DonationTier[] = [
  { amount: 500, label: '$5/mo', name: 'Sustainer', description: 'Steady support for ongoing work' },
  { amount: 1000, label: '$10/mo', name: 'Builder', description: 'Help ship features faster', featured: true },
  { amount: 2500, label: '$25/mo', name: 'Sponsor', description: 'Power long-term development' },
];
