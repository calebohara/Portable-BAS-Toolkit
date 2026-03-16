import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { isStripeConfigured, APP_BASE_URL } from '@/lib/stripe-config';
import type { DonationMode } from '@/lib/stripe-config';

/**
 * POST /api/donate/checkout
 *
 * Creates a Stripe Checkout Session for a donation.
 *
 * Body: { amount: number (cents), mode: 'one_time' | 'monthly' }
 * Returns: { url: string } — the Stripe Checkout URL to redirect to
 */
export async function POST(request: NextRequest) {
  // Guard: Stripe not configured yet
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Donations are not yet available. Stripe integration is coming soon.' },
      { status: 503 }
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: 'Stripe is not fully configured.' },
      { status: 503 }
    );
  }
  const stripe = new Stripe(secretKey);

  try {
    const body = await request.json();
    const { amount, mode } = body as { amount: number; mode: DonationMode };

    // Validate amount (minimum $1, maximum $500)
    if (!amount || typeof amount !== 'number' || amount < 100 || amount > 50000) {
      return NextResponse.json(
        { error: 'Invalid donation amount.' },
        { status: 400 }
      );
    }

    // Validate mode
    if (!mode || !['one_time', 'monthly'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid donation mode.' },
        { status: 400 }
      );
    }

    const isRecurring = mode === 'monthly';

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: isRecurring ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: isRecurring ? 'BAU Suite Monthly Support' : 'BAU Suite One-Time Donation',
              description: isRecurring
                ? 'Recurring monthly contribution to BAU Suite development'
                : 'One-time contribution to BAU Suite development',
            },
            unit_amount: amount,
            ...(isRecurring ? { recurring: { interval: 'month' } } : {}),
          },
          quantity: 1,
        },
      ],
      success_url: `${APP_BASE_URL}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_BASE_URL}/donate/cancel`,
      metadata: {
        source: 'bau-suite-donate',
        mode,
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
    console.error('[donate/checkout] Error:', err);
    return NextResponse.json(
      { error: 'An error occurred creating the checkout session.' },
      { status: 500 }
    );
  }
}
