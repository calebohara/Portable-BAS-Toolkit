/**
 * Single source of truth for subscription pricing and feature lists shown in
 * the UI — landing page (src/app/page.tsx), settings upgrade cards
 * (upgrade-cta.tsx), and the upgrade-required gate page.
 *
 * Display-only: the amounts actually charged come from the Stripe Price
 * objects behind the STRIPE_{PRO,TEAM}_{MONTHLY,YEARLY}_PRICE_ID env vars.
 * If a price changes in Stripe, it must change here too.
 */

export interface TierPricing {
  id: 'pro' | 'team';
  name: string;
  /** USD per month */
  monthly: number;
  /** USD per year */
  yearly: number;
  /** Full feature list (settings upgrade cards) */
  features: string[];
  /** Short bullet list for the landing page card */
  highlights: string[];
}

/** Monthly plans only — annual is already discounted (see api/subscribe/checkout). */
export const TRIAL_DAYS = 30;

export const PRO_TIER: TierPricing = {
  id: 'pro',
  name: 'Pro',
  monthly: 8,
  yearly: 79,
  features: [
    'Cloud sync across devices',
    'Automatic cloud backup',
    'Cloud restore & recovery',
    'Sync conflict resolution',
    'Direct messaging & inbox',
  ],
  highlights: ['Multi-device sync', 'Cloud backup & restore', 'Direct messaging'],
};

export const TEAM_TIER: TierPricing = {
  id: 'team',
  name: 'Team',
  monthly: 15,
  yearly: 149,
  features: [
    'Everything in Pro',
    'Global (shared) projects',
    'Team messaging',
    'Knowledge Base access',
    'Online presence',
  ],
  highlights: ['Global Projects', 'Knowledge Base', 'Team messaging'],
};

/** "save N%" for the annual plan vs 12 months of monthly. */
export function yearlySavingsPct(tier: TierPricing): number {
  return Math.round((1 - tier.yearly / (tier.monthly * 12)) * 100);
}

/** e.g. "$8/month or $79/year". */
export function priceSummary(tier: TierPricing): string {
  return `$${tier.monthly}/month or $${tier.yearly}/year`;
}
