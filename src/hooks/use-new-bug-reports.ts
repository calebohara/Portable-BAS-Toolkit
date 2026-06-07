'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAllBugReports } from '@/lib/db';
import { useAuth } from '@/providers/auth-provider';

const LAST_SEEN_KEY = 'bug-reports-last-seen';

function readLastSeen(): string {
  if (typeof localStorage === 'undefined') return new Date().toISOString();
  const stored = localStorage.getItem(LAST_SEEN_KEY);
  if (stored) return stored;
  // First visit: pin floor at "now" so existing pre-feature reports don't
  // pop a badge.
  const now = new Date().toISOString();
  localStorage.setItem(LAST_SEEN_KEY, now);
  return now;
}

function writeLastSeen(iso: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LAST_SEEN_KEY, iso);
}

/**
 * Admin-only count of bug reports created after the last time the admin
 * opened the Bug Reports panel.
 *
 * Returns `{ count, markSeen, isAdmin }`. Non-admin callers always see
 * `count === 0`.
 *
 * Refresh triggers:
 *   - On mount.
 *   - On the `bau-suite:bug-report-added` custom event (dispatched by
 *     `saveBugReport` in db.ts).
 *
 * `markSeen()` sets the floor timestamp to now and zeroes the count.
 * Call it when the Bug Reports panel mounts (i.e. the admin is looking
 * at the reports).
 */
export function useNewBugReports() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    // Non-admins never see a count — handled by deriving the returned value
    // below, so there's nothing to fetch here.
    if (!isAdmin) return;
    try {
      const lastSeen = readLastSeen();
      const reports = await getAllBugReports();
      const newCount = reports.filter((r) => r.createdAt > lastSeen).length;
      setCount(newCount);
    } catch {
      // ignore — keep prior count rather than flicker to 0 on transient errors
    }
  }, [isAdmin]);

  const markSeen = useCallback(async () => {
    writeLastSeen(new Date().toISOString());
    setCount(0);
  }, []);

  useEffect(() => {
    // Fetch the count on mount (and whenever the admin status changes via the
    // refresh callback identity). refresh() only setState's after an await, so
    // it's not a synchronous cascading render — this is the canonical
    // data-fetch-on-mount effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch on mount; setCount runs after await
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => { refresh(); };
    window.addEventListener('bau-suite:bug-report-added', handler);
    return () => window.removeEventListener('bau-suite:bug-report-added', handler);
  }, [refresh]);

  // Non-admins always see 0 — derived, so refresh() never has to setState
  // synchronously for them (which would trigger a cascading render).
  return { count: isAdmin ? count : 0, markSeen, isAdmin };
}
