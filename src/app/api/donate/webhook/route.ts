import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

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
 */

// Map Stripe price IDs to subscription tiers
function getPriceTier(priceId: string): 'pro' | 'team' | null {
  const mapping: Record<string, 'pro' | 'team'> = {};
  if (process.env.STRIPE_PRO_MONTHLY_PRICE_ID) mapping[process.env.STRIPE_PRO_MONTHLY_PRICE_ID] = 'pro';
  if (process.env.STRIPE_PRO_YEARLY_PRICE_ID) mapping[process.env.STRIPE_PRO_YEARLY_PRICE_ID] = 'pro';
  if (process.env.STRIPE_TEAM_MONTHLY_PRICE_ID) mapping[process.env.STRIPE_TEAM_MONTHLY_PRICE_ID] = 'team';
  if (process.env.STRIPE_TEAM_YEARLY_PRICE_ID) mapping[process.env.STRIPE_TEAM_YEARLY_PRICE_ID] = 'team';
  return mapping[priceId] ?? null;
}

/** Update subscription tier in Supabase profiles via admin client */
async function updateProfileTier(
  userId: string,
  tier: string,
  expiresAt: string | null,
  stripeCustomerId: string | null,
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    console.warn('[webhook] Cannot update profile: Supabase service role not configured');
    return;
  }

  // Use direct fetch to avoid importing the full Supabase client in this API route
  const body: Record<string, unknown> = {
    subscription_tier: tier,
    subscription_expires_at: expiresAt,
  };
  if (stripeCustomerId) body.stripe_customer_id = stripeCustomerId;

  const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[webhook] Profile update failed for ${userId}:`, await res.text());
  } else {
    console.info(`[webhook] Profile updated: ${userId} → tier=${tier}`);
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

  // Handle relevant events
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('[donate/webhook] Checkout completed:', {
        sessionId: session.id,
        amount: session.amount_total,
        mode: session.mode,
        metadata: session.metadata,
      });
      // Future: store donation record, send thank-you email, etc.
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items?.data?.[0]?.price?.id;
      const tier = priceId ? getPriceTier(priceId) : null;

      // Only process if this is a BAU Suite subscription (has a recognized price ID)
      if (tier) {
        // Get Supabase user ID from checkout session metadata
        // For subscription.created triggered by checkout, metadata is on the session
        // For subscription.updated, we look up by stripe_customer_id
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id ?? null;

        // Try to find the user ID from the subscription metadata or checkout session
        let userId: string | null = null;

        // Check if metadata has supabase_user_id (set during checkout)
        if (subscription.metadata?.supabase_user_id) {
          userId = subscription.metadata.supabase_user_id;
        }

        // Fallback: look up by customer ID in Supabase (for updates/renewals)
        if (!userId && customerId) {
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          if (serviceKey && supabaseUrl) {
            const lookupRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id&limit=1`,
              {
                headers: {
                  'apikey': serviceKey,
                  'Authorization': `Bearer ${serviceKey}`,
                },
              },
            );
            if (lookupRes.ok) {
              const rows = await lookupRes.json();
              if (rows?.[0]?.id) userId = rows[0].id;
            }
          }
        }

        if (userId) {
          // Stripe SDK v20+: current_period_end may be on the subscription items
          const subAny = subscription as unknown as Record<string, unknown>;
          const periodEnd = subAny.current_period_end as number | undefined;
          const expiresAt = periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null;
          await updateProfileTier(userId, tier, expiresAt, customerId);
        } else {
          console.warn('[webhook] Subscription event — could not resolve Supabase user ID:', {
            subscriptionId: subscription.id,
            customerId,
          });
        }
      } else {
        // Not a subscription with a recognized price — might be a donation subscription
        console.log('[webhook] Subscription event (non-paywall):', {
          subscriptionId: subscription.id,
          status: subscription.status,
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const deletedSub = event.data.object as Stripe.Subscription;
      const deletedCustomerId = typeof deletedSub.customer === 'string'
        ? deletedSub.customer
        : deletedSub.customer?.id ?? null;

      if (deletedCustomerId) {
        // Look up user by stripe_customer_id and reset to free
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (serviceKey && supabaseUrl) {
          const lookupRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${deletedCustomerId}&select=id&limit=1`,
            {
              headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
              },
            },
          );
          if (lookupRes.ok) {
            const rows = await lookupRes.json();
            if (rows?.[0]?.id) {
              await updateProfileTier(rows[0].id, 'free', null, null);
              console.info(`[webhook] Subscription cancelled — user ${rows[0].id} reset to free`);
            }
          }
        }
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

  return NextResponse.json({ received: true });
}
