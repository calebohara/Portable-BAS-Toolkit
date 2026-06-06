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
 * Looks up the Stripe customer ID server-side from the authenticated
 * user's profile — the client never supplies it (never trust a
 * customer ID from the client).
 *
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
    // 2. Look up the Stripe customer ID server-side from the user's profile.
    //    The client never sends it — we only trust the authenticated session.
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

    const stripeCustomerId = profile.stripe_customer_id;
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe customer on file for this account.' },
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
