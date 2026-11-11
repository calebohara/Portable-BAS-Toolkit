import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import {
  asSupabaseUserId,
  buildSubscriptionMetadata,
  getPriceTier,
  periodEndIso,
  resolveEntitlement,
} from '../stripe-subscription';

const ENV = {
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pro_m',
  STRIPE_PRO_YEARLY_PRICE_ID: 'price_pro_y',
  STRIPE_TEAM_MONTHLY_PRICE_ID: 'price_team_m',
  STRIPE_TEAM_YEARLY_PRICE_ID: 'price_team_y',
};

const USER = '3f2b9c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
const PERIOD_END = 1_800_000_000; // 2027-01-15T08:00:00Z

function sub(overrides: {
  status?: Stripe.Subscription.Status;
  priceId?: string;
  itemPeriodEnd?: number;
  legacyPeriodEnd?: number;
}): Stripe.Subscription {
  const { status = 'active', priceId = 'price_pro_m', itemPeriodEnd = PERIOD_END, legacyPeriodEnd } = overrides;
  return {
    id: 'sub_123',
    status,
    customer: 'cus_123',
    metadata: {},
    ...(legacyPeriodEnd !== undefined && { current_period_end: legacyPeriodEnd }),
    items: {
      data: [{ price: { id: priceId }, current_period_end: itemPeriodEnd }],
    },
  } as unknown as Stripe.Subscription;
}

describe('asSupabaseUserId', () => {
  it('accepts a UUID', () => {
    expect(asSupabaseUserId(USER)).toBe(USER);
  });

  it('rejects anything that could add a PostgREST filter', () => {
    expect(asSupabaseUserId(`${USER}&role=eq.admin`)).toBeNull();
    expect(asSupabaseUserId(`${USER},id.neq.null`)).toBeNull();
    expect(asSupabaseUserId('')).toBeNull();
    expect(asSupabaseUserId(undefined)).toBeNull();
    expect(asSupabaseUserId(42)).toBeNull();
  });
});

describe('buildSubscriptionMetadata', () => {
  it('carries the user id so the Subscription (not just the Session) has it', () => {
    expect(buildSubscriptionMetadata({ source: 's', tier: 'pro', interval: 'month', userId: USER })).toEqual({
      source: 's',
      tier: 'pro',
      interval: 'month',
      supabase_user_id: USER,
    });
  });

  it('omits the key instead of sending an empty string when there is no user', () => {
    const md = buildSubscriptionMetadata({ source: 's', tier: 'team', interval: 'year', userId: null });
    expect(md).not.toHaveProperty('supabase_user_id');
  });
});

describe('getPriceTier', () => {
  it('maps configured prices and ignores unknown ones', () => {
    expect(getPriceTier('price_pro_y', ENV)).toBe('pro');
    expect(getPriceTier('price_team_m', ENV)).toBe('team');
    expect(getPriceTier('price_donation', ENV)).toBeNull();
  });
});

describe('periodEndIso', () => {
  it('reads current_period_end from the subscription item (API 2025-03-31+)', () => {
    expect(periodEndIso(sub({}))).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it('falls back to the legacy top-level field', () => {
    const s = sub({ itemPeriodEnd: undefined as unknown as number, legacyPeriodEnd: PERIOD_END });
    expect(periodEndIso(s)).toBe(new Date(PERIOD_END * 1000).toISOString());
  });
});

describe('resolveEntitlement', () => {
  it.each(['active', 'trialing', 'past_due'] as const)('grants the tier while %s', (status) => {
    expect(resolveEntitlement(sub({ status, priceId: 'price_team_y' }), ENV)).toEqual({
      action: 'grant',
      tier: 'team',
      expiresAt: new Date(PERIOD_END * 1000).toISOString(),
    });
  });

  it.each(['canceled', 'unpaid', 'incomplete_expired', 'paused'] as const)('revokes when %s', (status) => {
    expect(resolveEntitlement(sub({ status }), ENV)).toEqual({ action: 'revoke' });
  });

  it('waits on an incomplete first payment', () => {
    expect(resolveEntitlement(sub({ status: 'incomplete' }), ENV).action).toBe('ignore');
  });

  it('ignores subscriptions that are not BAU Suite plans (e.g. monthly donations)', () => {
    expect(resolveEntitlement(sub({ priceId: 'price_donation' }), ENV).action).toBe('ignore');
  });
});
