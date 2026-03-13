import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * POST /api/donate/webhook
 *
 * Stripe webhook handler for donation events.
 * Verifies the webhook signature and processes relevant events.
 *
 * To configure:
 * 1. Create a webhook endpoint in your Stripe dashboard
 * 2. Point it to: https://your-domain.com/api/donate/webhook
 * 3. Subscribe to events: checkout.session.completed, customer.subscription.created
 * 4. Copy the signing secret to STRIPE_WEBHOOK_SECRET env var
 */
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

    case 'customer.subscription.created': {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('[donate/webhook] Subscription created:', {
        subscriptionId: subscription.id,
        status: subscription.status,
      });
      break;
    }

    default:
      // Unhandled event type — acknowledge receipt
      break;
  }

  return NextResponse.json({ received: true });
}
