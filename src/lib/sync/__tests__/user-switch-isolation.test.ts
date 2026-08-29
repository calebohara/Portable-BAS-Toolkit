import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fix A (Finding #2, Phase 1c) — same-device user isolation.
//
// Verifies the isolation DECISION (decideUserIsolation) and that wiring it to
// clearAllData + the store's cursor reset fires only on a genuine user CHANGE /
// sign-out, never on same-user re-auth.

vi.mock('@/lib/db', () => ({
  clearAllData: vi.fn().mockResolvedValue(undefined),
}));

// Stub the Supabase client module so importing the provider doesn't pull in
// real env-config side effects (the provider only needs the named exports).
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => null),
  isSupabaseConfigured: vi.fn(() => false),
}));

import { decideUserIsolation } from '@/providers/auth-provider';
import { clearAllData } from '@/lib/db';

const USER_A = '00000000-aaaa-aaaa-aaaa-000000000000';
const USER_B = '11111111-bbbb-bbbb-bbbb-111111111111';

describe('decideUserIsolation', () => {
  it('wipes when a DIFFERENT user signs in (genuine switch)', () => {
    expect(decideUserIsolation('SIGNED_IN', USER_A, USER_B)).toEqual({ wipe: true, retainPrevUserId: false });
  });

  it('does NOT wipe on same-user re-auth / token refresh (ids match)', () => {
    const same = { wipe: false, retainPrevUserId: false };
    expect(decideUserIsolation('TOKEN_REFRESHED', USER_A, USER_A)).toEqual(same);
    expect(decideUserIsolation('SIGNED_IN', USER_A, USER_A)).toEqual(same);
    expect(decideUserIsolation('USER_UPDATED', USER_A, USER_A)).toEqual(same);
  });

  it('wipes on a USER-INITIATED sign-out', () => {
    expect(decideUserIsolation('SIGNED_OUT', USER_A, null, { userInitiatedSignOut: true }))
      .toEqual({ wipe: true, retainPrevUserId: false });
  });

  // ── Involuntary sign-out (BASAgents 2026-08-29 P0) ────────────────────────
  // Supabase emits an identical SIGNED_OUT when the session is revoked out from
  // under the user — including from this app's own signOut({scope:'others'})
  // after a password change. Wiping there destroyed un-pushed offline work the
  // user never chose to discard.
  it('does NOT wipe on an INVOLUNTARY sign-out, and retains the prior id', () => {
    expect(decideUserIsolation('SIGNED_OUT', USER_A, null, { userInitiatedSignOut: false }))
      .toEqual({ wipe: false, retainPrevUserId: true });
  });

  it('treats an unflagged sign-out as involuntary (fail safe for data)', () => {
    // Privacy is not weakened by this default: the retained id means the next
    // sign-in by a different user still hits the switch branch and wipes.
    expect(decideUserIsolation('SIGNED_OUT', USER_A, null))
      .toEqual({ wipe: false, retainPrevUserId: true });
  });

  it('still wipes when a DIFFERENT user signs in after an involuntary sign-out', () => {
    // The id was retained, so this reads as a genuine switch — not a
    // first-ever login — and the wipe happens before the new SyncManager starts.
    const afterRevoke = decideUserIsolation('SIGNED_OUT', USER_A, null);
    expect(afterRevoke.retainPrevUserId).toBe(true);
    // prevAuthUserId therefore stays USER_A:
    expect(decideUserIsolation('SIGNED_IN', USER_A, USER_B))
      .toEqual({ wipe: true, retainPrevUserId: false });
  });

  it('does NOT wipe when the SAME user signs back in after an involuntary sign-out', () => {
    expect(decideUserIsolation('SIGNED_IN', USER_A, USER_A))
      .toEqual({ wipe: false, retainPrevUserId: false });
  });

  it('does NOT wipe a first-ever login on a device with no recorded prior id', () => {
    // Legitimately-hydrated local-only store the user is now signing in to claim.
    expect(decideUserIsolation('SIGNED_IN', null, USER_A)).toEqual({ wipe: false, retainPrevUserId: false });
  });

  it('does NOT wipe an offline/local-only session with no auth user (never signed in)', () => {
    expect(decideUserIsolation('INITIAL_SESSION', null, null)).toEqual({ wipe: false, retainPrevUserId: false });
  });
});

describe('isolation wiring (clearAllData + cursor reset)', () => {
  // Mirror the provider's reconcile body so we exercise the exact branch logic
  // against a fake store, without mounting React.
  const resetSyncCursors = vi.fn();
  const setLastAuthUserId = vi.fn();

  async function reconcile(
    event: string,
    prevId: string | null,
    newUserId: string | null,
    userInitiatedSignOut = false,
  ) {
    const { wipe, retainPrevUserId } = decideUserIsolation(
      event, prevId, newUserId, { userInitiatedSignOut },
    );
    if (wipe) {
      await clearAllData();
      resetSyncCursors();
    }
    if (!retainPrevUserId) setLastAuthUserId(newUserId);
  }

  beforeEach(() => vi.clearAllMocks());

  it('different user → clearAllData + resetSyncCursors + records new id', async () => {
    await reconcile('SIGNED_IN', USER_A, USER_B);
    expect(clearAllData).toHaveBeenCalledTimes(1);
    expect(resetSyncCursors).toHaveBeenCalledTimes(1);
    expect(setLastAuthUserId).toHaveBeenCalledWith(USER_B);
  });

  it('same user re-auth → NO clear, NO cursor reset', async () => {
    await reconcile('TOKEN_REFRESHED', USER_A, USER_A);
    expect(clearAllData).not.toHaveBeenCalled();
    expect(resetSyncCursors).not.toHaveBeenCalled();
    // Still records (idempotent) the (unchanged) id.
    expect(setLastAuthUserId).toHaveBeenCalledWith(USER_A);
  });

  it('user-initiated sign-out → clearAllData + resetSyncCursors + clears recorded id', async () => {
    await reconcile('SIGNED_OUT', USER_A, null, true);
    expect(clearAllData).toHaveBeenCalledTimes(1);
    expect(resetSyncCursors).toHaveBeenCalledTimes(1);
    expect(setLastAuthUserId).toHaveBeenCalledWith(null);
  });

  it('involuntary sign-out → NO clear, NO cursor reset, id NOT cleared', async () => {
    await reconcile('SIGNED_OUT', USER_A, null, false);
    expect(clearAllData).not.toHaveBeenCalled();
    expect(resetSyncCursors).not.toHaveBeenCalled();
    // Critically: the id is NOT set to null, or a different user's next sign-in
    // would look like a first-ever login and skip the isolation wipe.
    expect(setLastAuthUserId).not.toHaveBeenCalled();
  });

  it('revoked session then a DIFFERENT user signs in → wipe still happens', async () => {
    await reconcile('SIGNED_OUT', USER_A, null, false);
    expect(clearAllData).not.toHaveBeenCalled();

    // lastAuthUserId is still USER_A because the previous step retained it.
    await reconcile('SIGNED_IN', USER_A, USER_B);
    expect(clearAllData).toHaveBeenCalledTimes(1);
    expect(resetSyncCursors).toHaveBeenCalledTimes(1);
    expect(setLastAuthUserId).toHaveBeenCalledWith(USER_B);
  });

  it('revoked session then the SAME user signs back in → work is preserved', async () => {
    await reconcile('SIGNED_OUT', USER_A, null, false);
    await reconcile('SIGNED_IN', USER_A, USER_A);
    expect(clearAllData).not.toHaveBeenCalled();
    expect(resetSyncCursors).not.toHaveBeenCalled();
  });
});
