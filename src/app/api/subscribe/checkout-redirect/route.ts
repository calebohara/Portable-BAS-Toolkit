import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { APP_BASE_URL } from '@/lib/stripe-config';

/**
 * GET /api/subscribe/checkout-redirect
 *
 * Creates a Stripe Checkout Session and redirects directly to the Stripe URL.
 * This route exists for the Tauri desktop app, which can't call POST API routes
 * but can open a URL in the system browser via `shell:allow-open`.
 *
 * The system browser navigates to this URL → server creates Stripe session →
 * 302 redirect to Stripe Checkout → user pays → webhook updates Supabase profile →
 * desktop app picks up new subscription_tier on next profile fetch.
 *
 * Query params: ?tier=pro|team&interval=month|year&userId=uuid
 */

type Tier = 'pro' | 'team';
type Interval = 'month' | 'year';

function getPriceId(tier: Tier, interval: Interval): string | undefined {
  const key = `STRIPE_${tier.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'YEARLY'}_PRICE_ID`;
  return process.env[key];
}

export async function GET(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: 'Stripe is not configured.' },
      { status: 503 }
    );
  }

  const stripe = new Stripe(secretKey);

  try {
    const { searchParams } = request.nextUrl;
    const tier = searchParams.get('tier');
    const interval = searchParams.get('interval');
    const userId = searchParams.get('userId') || '';

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
        { error: `Price not configured for ${tier}/${interval}.` },
        { status: 503 }
      );
    }

    // Create Checkout Session
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
        source: 'bau-suite-subscription-desktop',
        tier,
        interval,
        supabase_user_id: userId,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session.' },
        { status: 500 }
      );
    }

    // Redirect to Stripe Checkout directly
    return NextResponse.redirect(session.url);
  } catch (err) {
    console.error('[subscribe/checkout-redirect] Error:', err);
    return NextResponse.json(
      { error: 'An error occurred creating the checkout session.' },
      { status: 500 }
    );
  }
}
