'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';

export interface OnlineUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

/**
 * Tracks online users via Supabase Realtime Presence.
 * Joins a shared presence channel when authenticated and leaves on unmount.
 */
export function useOnlineUsers() {
  const { mode, user, profile } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  // Stable channel + subscription flag so profile changes re-`track()` on the
  // existing channel instead of tearing it down and recreating it (which can
  // leave a dangling in-flight track() and list the user as online twice).
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);

  const parsePresenceState = useCallback((state: Record<string, unknown[]>) => {
    const users: OnlineUser[] = [];
    const seen = new Set<string>();

    for (const presences of Object.values(state)) {
      for (const p of presences) {
        const presence = p as Record<string, unknown>;
        const userId = presence.userId as string;
        if (userId && !seen.has(userId)) {
          seen.add(userId);
          users.push({
            userId,
            displayName: (presence.displayName as string) || 'User',
            avatarUrl: (presence.avatarUrl as string) || null,
            joinedAt: (presence.joinedAt as string) || new Date().toISOString(),
          });
        }
      }
    }

    // Sort by join time
    users.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    setOnlineUsers(users);
  }, []);

  // Build the presence payload from the latest profile fields.
  const buildPresence = useCallback(() => {
    if (!user) return null;
    const displayName = profile?.displayName
      || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')
      || user.email?.split('@')[0]
      || 'User';
    return {
      userId: user.id,
      displayName,
      avatarUrl: profile?.avatarUrl || null,
      joinedAt: new Date().toISOString(),
    };
  }, [user, profile?.displayName, profile?.firstName, profile?.lastName, profile?.avatarUrl]);

  // Effect 1 — create / subscribe the presence channel. Keyed only on the
  // session identity so it is NOT torn down when profile fields change.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || mode !== 'authenticated' || !user) return;

    const ch = client.channel('online-users', {
      config: {
        presence: { key: user.id },
      },
    });
    channelRef.current = ch;
    subscribedRef.current = false;

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as unknown as Record<string, unknown[]>;
      parsePresenceState(state);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        subscribedRef.current = true;
        const presence = buildPresence();
        if (presence) await ch.track(presence);
      }
    });

    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      ch.untrack();
      client.removeChannel(ch);
    };
    // buildPresence intentionally omitted — re-tracking on profile change is
    // handled by Effect 2 below so the channel itself stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user, parsePresenceState]);

  // Effect 2 — re-`track()` on the existing channel whenever profile fields
  // change, instead of recreating the channel.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !subscribedRef.current) return;
    const presence = buildPresence();
    if (presence) {
      ch.track(presence).catch(() => { /* channel may be tearing down */ });
    }
  }, [buildPresence]);

  return { onlineUsers, count: onlineUsers.length };
}
