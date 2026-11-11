/**
 * Pure helpers for turning Stripe subscription state into a BAU Suite
 * entitlement. Shared by the checkout routes (what metadata to stamp) and the
 * webhook (what to do with an event), and kept free of I/O so they are
 * unit-testable.
 *
 * Background (STRIPE-TIER-NEVER-GRANTED, BASAgents 2026-08-29): checkout put
 * `supabase_user_id` on the Checkout *Session* metadata only. Stripe does not
 * copy session metadata onto the Subscription, so the webhook's
 * `subscription.metadata.supabase_user_id` read was always empty, and the
 * `stripe_customer_id` fallback can't match a first-time subscriber (that
 * column is only written BY this webhook). A first-time subscriber was charged
 * and stayed on `free`.
 */
import type Stripe from 'stripe';

export type PaidTier = 'pro' | 'team';
export type CheckoutInterval = 'month' | 'year';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns `value` only if it is a UUID (a Supabase auth user id).
 *
 * The id arrives from an unauthenticated checkout request and ends up inside a
 * PostgREST filter (`profiles?id=eq.<id>`), so anything else — including
 * strings carrying `&` or `,` that could add filters — is dropped.
 */
export function asSupabaseUserId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

/** Metadata stamped on BOTH the Checkout Session and the Subscription. */
export function buildSubscriptionMetadata(opts: {
  source: string;
  tier: PaidTier;
  interval: CheckoutInterval;
  userId: string | null;
}): Record<string, string> {
  const metadata: Record<string, string> = {
    source: opts.source,
    tier: opts.tier,
    interval: opts.interval,
  };
  // Stripe treats an empty-string value as "unset", so only send a real id.
  if (opts.userId) metadata.supabase_user_id = opts.userId;
  return metadata;
}

/** Maps the configured Stripe price IDs to tiers. Unknown prices → null. */
export function getPriceTier(
  priceId: string,
  env: Record<string, string | undefined> = process.env,
): PaidTier | null {
  const mapping: Record<string, PaidTier> = {};
  if (env.STRIPE_PRO_MONTHLY_PRICE_ID) mapping[env.STRIPE_PRO_MONTHLY_PRICE_ID] = 'pro';
  if (env.STRIPE_PRO_YEARLY_PRICE_ID) mapping[env.STRIPE_PRO_YEARLY_PRICE_ID] = 'pro';
  if (env.STRIPE_TEAM_MONTHLY_PRICE_ID) mapping[env.STRIPE_TEAM_MONTHLY_PRICE_ID] = 'team';
  if (env.STRIPE_TEAM_YEARLY_PRICE_ID) mapping[env.STRIPE_TEAM_YEARLY_PRICE_ID] = 'team';
  return mapping[priceId] ?? null;
}

export function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id ?? null;
}

/**
 * The end of the current billing period, as an ISO string.
 *
 * Stripe API 2025-03-31 ("basil") moved `current_period_end` from the
 * Subscription onto its items; the SDK in use pins 2026-02-25.clover, so the
 * old top-level read always returned undefined and `subscription_expires_at`
 * was always null (no "Renews …" date, no post-cancel grace period). Read the
 * item first, keep the legacy field as a fallback for older pinned versions.
 */
export function periodEndIso(subscription: Stripe.Subscription): string | null {
  const itemEnd = subscription.items?.data?.[0]?.current_period_end;
  const legacyEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const end = itemEnd ?? legacyEnd;
  return typeof end === 'number' && end > 0 ? new Date(end * 1000).toISOString() : null;
}

/** Statuses that hold the paid tier. `past_due` keeps it while Stripe retries the card. */
const ENTITLED: ReadonlySet<Stripe.Subscription.Status> = new Set(['active', 'trialing', 'past_due']);
/** Statuses that end it. `paused` = trial ended with no payment method. */
const ENDED: ReadonlySet<Stripe.Subscription.Status> = new Set(['canceled', 'unpaid', 'incomplete_expired', 'paused']);

export type Entitlement =
  | { action: 'grant'; tier: PaidTier; expiresAt: string | null }
  | { action: 'revoke' }
  | { action: 'ignore'; reason: string };

/**
 * What a subscription's current state means for the profile.
 *
 * Previously every created/updated event with a known price granted the tier,
 * so an `unpaid` or `incomplete_expired` subscription still kept Pro.
 */
export function resolveEntitlement(
  subscription: Stripe.Subscription,
  env: Record<string, string | undefined> = process.env,
): Entitlement {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const tier = priceId ? getPriceTier(priceId, env) : null;
  if (!tier) return { action: 'ignore', reason: 'not a BAU Suite plan price' };

  if (ENTITLED.has(subscription.status)) {
    return { action: 'grant', tier, expiresAt: periodEndIso(subscription) };
  }
  if (ENDED.has(subscription.status)) return { action: 'revoke' };
  // `incomplete`: the first invoice hasn't been paid yet — wait for the next event.
  return { action: 'ignore', reason: `status ${subscription.status}` };
}
