'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchRecentSharesForCurrentUser, type RecentShare } from '@/lib/global-projects/api';

const LAST_SEEN_KEY = 'bau-suite:shares-last-seen';

/**
 * Shares delivered to the current user since the last time they acknowledged.
 *
 * The "last seen" floor is persisted to localStorage so that a dismissed
 * toast / viewed Global Projects page won't surface the same shares again on
 * next sign-in. SSR-safe: localStorage reads/writes are guarded.
 *
 * Call `clearSeen()` after surfacing the shares to the user to bump the floor
 * to now.
 */
export function useRecentShares() {
  const [shares, setShares] = useState<RecentShare[]>([]);

  const refresh = useCallback(async () => {
    const lastSeen =
      typeof localStorage !== 'undefined'
        ? (localStorage.getItem(LAST_SEEN_KEY) ?? new Date(0).toISOString())
        : new Date(0).toISOString();
    const result = await fetchRecentSharesForCurrentUser(lastSeen);
    if (result.error === null) setShares(result.data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearSeen = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    }
    setShares([]);
  }, []);

  return { shares, count: shares.length, clearSeen, refresh };
}
