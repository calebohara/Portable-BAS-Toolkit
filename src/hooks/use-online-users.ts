'use client';

import { useEffect, useState, useCallback } from 'react';
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

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || mode !== 'authenticated' || !user) return;

    const displayName = profile?.displayName
      || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')
      || user.email?.split('@')[0]
      || 'User';

    const ch = client.channel('online-users', {
      config: {
        presence: { key: user.id },
      },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as unknown as Record<string, unknown[]>;
      parsePresenceState(state);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({
          userId: user.id,
          displayName,
          avatarUrl: profile?.avatarUrl || null,
          joinedAt: new Date().toISOString(),
        });
      }
    });

    return () => {
      ch.untrack();
      client.removeChannel(ch);
    };
  }, [mode, user, profile?.displayName, profile?.firstName, profile?.lastName, profile?.avatarUrl, parsePresenceState]);

  return { onlineUsers, count: onlineUsers.length };
}
