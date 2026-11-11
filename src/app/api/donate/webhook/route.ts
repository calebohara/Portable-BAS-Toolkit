import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  asSupabaseUserId,
  customerIdOf,
  getPriceTier,
  resolveEntitlement,
} from '@/lib/stripe-subscription';

/**
 * POST /api/donate/webhook
 *
 * Stripe webhook handler for donation AND subscription events.
 * Verifies the webhook signature and processes relevant events.
 *
 * To configure:
 * 1. Create a webhook endpoint in your Stripe dashboard
 * 2. Point it to: https://your-domain.com/api/donate/webhook
 * 3. Subscribe to events: checkout.session.completed, customer.subscription.created,
 *    customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
 * 4. Copy the signing secret to STRIPE_WEBHOOK_SECRET env var
 *
 * Failure semantics: if a profile write fails, the handler returns 500 so
 * Stripe retries the event (it retries for up to 3 days). It used to swallow
 * the error and return 200, which dropped the grant for good.
 */

class ProfileWriteError extends Error {}

function supabaseAdminEnv(): { serviceKey: string; supabaseUrl: string } {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    throw new ProfileWriteError('Supabase service role not configured');
  }
  return { serviceKey, supabaseUrl };
}

/** Update subscription tier in Supabase profiles via the service role. */
async function updateProfileTier(
  userId: string,
  tier: string,
  expiresAt: string | null,
  stripeCustomerId: string | null,
): Promise<void> {
  const { serviceKey, supabaseUrl } = supabaseAdminEnv();

  // Use direct fetch to avoid importing the full Supabase client in this API route
  const body: Record<string, unknown> = {
    subscription_tier: tier,
    subscription_expires_at: expiresAt,
  };
  if (stripeCustomerId) body.stripe_customer_id = stripeCustomerId;

  // userId has been through asSupabaseUserId (UUID-only) before reaching here.
  const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=id`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ProfileWriteError(`Profile update failed for ${userId}: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json().catch(() => [])) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    // Not retryable — the account doesn't exist (deleted, or a bad id).
    console.warn(`[webhook] Profile update matched no row for ${userId} (tier=${tier})`);
    return;
  }
  console.info(`[webhook] Profile updated: ${userId} → tier=${tier}`);
}

/** Look up the Supabase user that owns a Stripe customer (renewals, cancellations). */
async function findUserIdByCustomer(customerId: string): Promise<string | null> {
  const { serviceKey, supabaseUrl } = supabaseAdminEnv();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    },
  );
  if (!res.ok) {
    throw new ProfileWriteError(`Customer lookup failed for ${customerId}: ${res.status}`);
  }
  const rows = await res.json();
  return asSupabaseUserId(rows?.[0]?.id);
}

/**
 * Re-read the subscription so out-of-order deliveries (a stale `updated`
 * arriving after `deleted`) act on Stripe's current state, not the event's.
 */
async function freshSubscription(stripe: Stripe, sub: Stripe.Subscription | string): Promise<Stripe.Subscription> {
  const id = typeof sub === 'string' ? sub : sub.id;
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (err) {
    if (typeof sub === 'string') throw err;
    console.warn('[webhook] Could not re-fetch subscription; using event payload:', id, err);
    return sub;
  }
}

/**
 * Apply a subscription's current state to the owning profile.
 *
 * User resolution order: the id stamped on the subscription at checkout
 * (subscription_data.metadata), then the hint from the Checkout Session, then
 * the stripe_customer_id link written by an earlier grant.
 */
async function applySubscription(subscription: Stripe.Subscription, userIdHint: string | null): Promise<void> {
  const entitlement = resolveEntitlement(subscription);
  if (entitlement.action === 'ignore') {
    console.log('[webhook] Subscription event ignored:', {
      subscriptionId: subscription.id,
      status: subscription.status,
      reason: entitlement.reason,
    });
    return;
  }

  const customerId = customerIdOf(subscription.customer);
  const userId =
    asSupabaseUserId(subscription.metadata?.supabase_user_id) ??
    userIdHint ??
    (customerId ? await findUserIdByCustomer(customerId) : null);

  if (!userId) {
    console.warn('[webhook] Subscription event — could not resolve Supabase user ID:', {
      subscriptionId: subscription.id,
      customerId,
    });
    return;
  }

  if (entitlement.action === 'grant') {
    await updateProfileTier(userId, entitlement.tier, entitlement.expiresAt, customerId);
  } else {
    await updateProfileTier(userId, 'free', null, customerId);
    console.info(`[webhook] Subscription ${subscription.status} — user ${userId} reset to free`);
  }
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook not configured.' },
      { status: 503 }
    );
  }

  const stripe = new Stripe(secretKey);
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header.' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[donate/webhook] Signature verification failed:', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed.' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[donate/webhook] Checkout completed:', {
          sessionId: session.id,
          amount: session.amount_total,
          mode: session.mode,
          metadata: session.metadata,
        });

        // Subscription checkout: the session is the one object guaranteed to
        // carry our user id, so grant from here too. Stripe doesn't order
        // events — whichever of this and subscription.created lands first
        // grants, and the second is an idempotent re-write.
        if (session.mode === 'subscription' && session.subscription) {
          const hint =
            asSupabaseUserId(session.client_reference_id) ??
            asSupabaseUserId(session.metadata?.supabase_user_id);
          const subscription = await freshSubscription(stripe, session.subscription);
          await applySubscription(subscription, hint);
        }
        // Donations (mode 'payment'): future — store record, send thank-you, etc.
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = await freshSubscription(stripe, event.data.object as Stripe.Subscription);
        await applySubscription(subscription, null);
        break;
      }

      case 'customer.subscription.deleted': {
        const deletedSub = event.data.object as Stripe.Subscription;
        // Only a BAU Suite plan ends the tier. Without this, cancelling a
        // monthly *donation* reset a paying subscriber on the same Stripe
        // customer to free.
        const priceId = deletedSub.items?.data?.[0]?.price?.id;
        if (!priceId || !getPriceTier(priceId)) break;
        const customerId = customerIdOf(deletedSub.customer);
        const userId =
          asSupabaseUserId(deletedSub.metadata?.supabase_user_id) ??
          (customerId ? await findUserIdByCustomer(customerId) : null);
        if (userId) {
          await updateProfileTier(userId, 'free', null, null);
          console.info(`[webhook] Subscription cancelled — user ${userId} reset to free`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn('[webhook] Payment failed:', {
          invoiceId: invoice.id,
          customer: invoice.customer,
          attemptCount: invoice.attempt_count,
        });
        // Don't immediately downgrade — Stripe handles dunning/retry
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    // 500 → Stripe retries. Better a delayed grant than a charged user left on free.
    console.error(`[donate/webhook] Failed to process ${event.type} (${event.id}):`, err);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
