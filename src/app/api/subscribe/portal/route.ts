import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { APP_BASE_URL } from '@/lib/stripe-config';

/**
 * POST /api/subscribe/portal
 *
 * Creates a Stripe Billing Portal session for subscription management.
 * Allows users to update payment method, change plan, or cancel.
 *
 * Body: { stripeCustomerId: string }
 * Returns: { url: string } — the Stripe Portal URL to redirect to
 */
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
    const { stripeCustomerId } = body as { stripeCustomerId: string };

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Missing Stripe customer ID.' },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${APP_BASE_URL}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[subscribe/portal] Error:', err);
    return NextResponse.json(
      { error: 'Failed to create portal session.' },
      { status: 500 }
    );
  }
}
