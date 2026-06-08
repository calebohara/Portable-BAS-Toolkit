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
    expect(decideUserIsolation('SIGNED_IN', USER_A, USER_B)).toEqual({ wipe: true });
  });

  it('does NOT wipe on same-user re-auth / token refresh (ids match)', () => {
    expect(decideUserIsolation('TOKEN_REFRESHED', USER_A, USER_A)).toEqual({ wipe: false });
    expect(decideUserIsolation('SIGNED_IN', USER_A, USER_A)).toEqual({ wipe: false });
    expect(decideUserIsolation('USER_UPDATED', USER_A, USER_A)).toEqual({ wipe: false });
  });

  it('wipes on explicit sign-out', () => {
    expect(decideUserIsolation('SIGNED_OUT', USER_A, null)).toEqual({ wipe: true });
  });

  it('does NOT wipe a first-ever login on a device with no recorded prior id', () => {
    // Legitimately-hydrated local-only store the user is now signing in to claim.
    expect(decideUserIsolation('SIGNED_IN', null, USER_A)).toEqual({ wipe: false });
  });

  it('does NOT wipe an offline/local-only session with no auth user (never signed in)', () => {
    expect(decideUserIsolation('INITIAL_SESSION', null, null)).toEqual({ wipe: false });
  });
});

describe('isolation wiring (clearAllData + cursor reset)', () => {
  // Mirror the provider's reconcile body so we exercise the exact branch logic
  // against a fake store, without mounting React.
  const resetSyncCursors = vi.fn();
  const setLastAuthUserId = vi.fn();

  async function reconcile(event: string, prevId: string | null, newUserId: string | null) {
    const { wipe } = decideUserIsolation(event, prevId, newUserId);
    if (wipe) {
      await clearAllData();
      resetSyncCursors();
    }
    setLastAuthUserId(newUserId);
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

  it('sign-out → clearAllData + resetSyncCursors + clears recorded id', async () => {
    await reconcile('SIGNED_OUT', USER_A, null);
    expect(clearAllData).toHaveBeenCalledTimes(1);
    expect(resetSyncCursors).toHaveBeenCalledTimes(1);
    expect(setLastAuthUserId).toHaveBeenCalledWith(null);
  });
});
