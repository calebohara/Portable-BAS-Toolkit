/**
 * Paywall utilities for the cloud sync subscription model.
 *
 * CRITICAL SAFETY RULE: All functions return the PERMISSIVE default (true / no paywall)
 * when NEXT_PUBLIC_SYNC_PAYWALL is unset or anything other than 'true'.
 * This ensures zero behavioral change when the flag is off.
 */

/** Whether the sync paywall feature flag is enabled */
export function isPaywallEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SYNC_PAYWALL === 'true';
}

/** Whether a user's tier grants cloud sync access (Pro or Team) */
export function hasSyncAccess(tier: string | undefined): boolean {
  if (!isPaywallEnabled()) return true; // paywall off = everyone syncs
  return tier === 'pro' || tier === 'team';
}

/** Whether a user's tier grants collaboration access — Global Projects, KB (Team only) */
export function hasCollabAccess(tier: string | undefined): boolean {
  if (!isPaywallEnabled()) return true; // paywall off = everyone collaborates
  return tier === 'team';
}

/** Whether a subscription is within its 7-day grace period after expiry */
export function isInGracePeriod(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  const grace = new Date(expiry.getTime() + 7 * 24 * 60 * 60 * 1000);
  return new Date() <= grace;
}
