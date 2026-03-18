import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { APP_BASE_URL } from '@/lib/stripe-config';

/**
 * POST /api/subscribe/checkout
 *
 * Creates a Stripe Checkout Session for a Pro or Team subscription.
 * Separate from /api/donate/checkout — donations and subscriptions
 * are independent flows.
 *
 * Body: { tier: 'pro' | 'team', interval: 'month' | 'year', userId: string }
 * Returns: { url: string } — the Stripe Checkout URL to redirect to
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRO_MONTHLY_PRICE_ID
 *   STRIPE_PRO_YEARLY_PRICE_ID
 *   STRIPE_TEAM_MONTHLY_PRICE_ID
 *   STRIPE_TEAM_YEARLY_PRICE_ID
 */

type Tier = 'pro' | 'team';
type Interval = 'month' | 'year';

function getPriceId(tier: Tier, interval: Interval): string | undefined {
  const key = `STRIPE_${tier.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'YEARLY'}_PRICE_ID`;
  return process.env[key];
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: 'Stripe is not configured.' },
      { status: 503 }
    );
  }

  const stripe = new Stripe(secretKey);

  try {
    const body = await request.json();
    const { tier, interval, userId } = body as {
      tier: string;
      interval: string;
      userId?: string;
    };

    // Validate tier
    if (!tier || !['pro', 'team'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier.' }, { status: 400 });
    }

    // Validate interval
    if (!interval || !['month', 'year'].includes(interval)) {
      return NextResponse.json({ error: 'Invalid interval.' }, { status: 400 });
    }

    // Get price ID from env
    const priceId = getPriceId(tier as Tier, interval as Interval);
    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured for ${tier}/${interval}. Set STRIPE_${tier.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'YEARLY'}_PRICE_ID.` },
        { status: 503 }
      );
    }

    // Create Checkout Session in subscription mode
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${APP_BASE_URL}/settings?subscription=success`,
      cancel_url: `${APP_BASE_URL}/settings?subscription=cancelled`,
      metadata: {
        source: 'bau-suite-subscription',
        tier,
        interval,
        // Used by webhook to correlate subscription → Supabase user
        supabase_user_id: userId || '',
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[subscribe/checkout] Error:', err);
    return NextResponse.json(
      { error: 'An error occurred creating the checkout session.' },
      { status: 500 }
    );
  }
}
