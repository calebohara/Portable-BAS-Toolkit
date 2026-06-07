'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchRecentSharesForCurrentUser, type RecentShare } from '@/lib/global-projects/api';
import { useAuth } from '@/providers/auth-provider';

/**
 * Per-user localStorage key for the "last seen" floor. Scoping by user id keeps
 * a shared field laptop (one user signs out, another signs in) from inheriting
 * the previous tech's floor and silently swallowing incoming shares.
 */
const lastSeenKey = (userId: string | undefined) =>
  userId ? `bau-suite:shares-last-seen:${userId}` : 'bau-suite:shares-last-seen';

/**
 * Shares delivered to the current user since the last time they acknowledged.
 *
 * The "last seen" floor is persisted to localStorage (keyed per user id) so
 * that a dismissed toast / viewed Global Projects page won't surface the same
 * shares again on next sign-in. SSR-safe: localStorage reads/writes are guarded.
 *
 * Call `clearSeen()` after surfacing the shares to the user to bump the floor
 * to now.
 */
export function useRecentShares() {
  const { user } = useAuth();
  const userId = user?.id;
  const [shares, setShares] = useState<RecentShare[]>([]);

  const refresh = useCallback(async () => {
    const key = lastSeenKey(userId);
    const lastSeen =
      typeof localStorage !== 'undefined'
        ? (localStorage.getItem(key) ?? new Date(0).toISOString())
        : new Date(0).toISOString();
    const result = await fetchRecentSharesForCurrentUser(lastSeen);
    if (result.error === null) setShares(result.data);
  }, [userId]);

  useEffect(() => {
    // Fetch-on-mount (and on user change). refresh() is async, so setShares
    // runs after the awaited fetch resolves — not synchronously during the
    // effect — but the compiler can't see through the awaited boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch; setState happens post-await, not synchronously
    void refresh();
  }, [refresh]);

  const clearSeen = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(lastSeenKey(userId), new Date().toISOString());
    }
    setShares([]);
  }, [userId]);

  return { shares, count: shares.length, clearSeen, refresh };
}
