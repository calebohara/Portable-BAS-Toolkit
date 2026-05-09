import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { APP_BASE_URL } from '@/lib/stripe-config';

/**
 * POST /api/subscribe/portal
 *
 * Creates a Stripe Billing Portal session for subscription management.
 * Allows users to update payment method, change plan, or cancel.
 *
 * Requires the user's access token in the Authorization header.
 * Verifies the provided stripeCustomerId matches the authenticated
 * user's profile before creating a portal session.
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

  // 1. Verify the caller is authenticated
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // Create a client using the user's token to verify identity
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
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

    // 2. Verify the stripeCustomerId belongs to this user
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found.' },
        { status: 403 }
      );
    }

    if (profile.stripe_customer_id !== stripeCustomerId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
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
