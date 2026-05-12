'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { fetchPendingApprovalsCount } from '@/lib/global-projects/api';

/**
 * Admin-only count of profiles awaiting approval.
 *
 * Returns `{ count, loading, isAdmin }`. Non-admin callers always see
 * `count === 0` and `isAdmin === false` — even if the server query somehow
 * succeeded, we gate visibility client-side as defense in depth (the existing
 * RLS on `profiles` is the authoritative gate).
 *
 * Realtime: subscribes to `profiles` table inserts and updates so the badge
 * reacts to new signups and approval-flips without manual refresh.
 */
export function usePendingApprovals() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAdmin) {
      setCount(0);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const result = await fetchPendingApprovalsCount();
      if (result.error === null) setCount(result.data);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAdmin) return;
    const client = getSupabaseClient();
    if (!client) return;
    const ch = client
      .channel('pending-approvals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => refresh(),
      )
      .subscribe();
    return () => {
      client.removeChannel(ch);
    };
  }, [isAdmin, refresh]);

  return { count, loading, isAdmin };
}
