'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  senderAvatar: string | null;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface InboxContact {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

// Profile cache to resolve user IDs to names without FK joins
type ProfileMap = Map<string, { displayName: string; avatarUrl: string | null }>;

/**
 * Hook for managing user inbox — direct messages with real-time updates.
 */
export function useInbox() {
  const { mode, user } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<DirectMessage[]>([]);
  const [contacts, setContacts] = useState<InboxContact[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const profileCache = useRef<ProfileMap>(new Map());

  // Fetch and cache all profiles (lightweight — id, display_name, avatar_url only)
  const ensureProfiles = useCallback(async () => {
    if (profileCache.current.size > 0) return;
    const client = getSupabaseClient();
    if (!client) return;

    const { data } = await client
      .from('profiles')
      .select('id, display_name, avatar_url, email');

    if (data) {
      for (const p of data) {
        profileCache.current.set(p.id, {
          displayName: p.display_name || p.email || 'User',
          avatarUrl: p.avatar_url || null,
        });
      }
    }
  }, []);

  const resolveProfile = (userId: string) => {
    return profileCache.current.get(userId) || { displayName: 'Unknown User', avatarUrl: null };
  };

  // Fetch inbox messages (no FK join — resolve names from cache)
  const fetchInbox = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    try {
      await ensureProfiles();

      const { data, error } = await client
        .from('direct_messages')
        .select('id, sender_id, recipient_id, subject, body, read_at, created_at')
        .eq('recipient_id', user.id)
        .eq('deleted_by_recipient', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[inbox] Fetch inbox error:', error.message);
        return;
      }

      if (data) {
        const mapped: DirectMessage[] = data.map((m) => {
          const profile = resolveProfile(m.sender_id);
          return {
            id: m.id,
            senderId: m.sender_id,
            recipientId: m.recipient_id,
            senderName: profile.displayName,
            senderAvatar: profile.avatarUrl,
            subject: m.subject,
            body: m.body,
            readAt: m.read_at,
            createdAt: m.created_at,
          };
        });
        setMessages(mapped);
        setUnreadCount(mapped.filter((m) => !m.readAt).length);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [user, ensureProfiles]);

  // Fetch sent messages (no FK join — resolve names from cache)
  const fetchSent = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    try {
      await ensureProfiles();

      const { data, error } = await client
        .from('direct_messages')
        .select('id, sender_id, recipient_id, subject, body, read_at, created_at')
        .eq('sender_id', user.id)
        .eq('deleted_by_sender', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[inbox] Fetch sent error:', error.message);
        return;
      }

      if (data) {
        const mapped: DirectMessage[] = data.map((m) => {
          const profile = resolveProfile(m.recipient_id);
          return {
            id: m.id,
            senderId: m.sender_id,
            recipientId: m.recipient_id,
            senderName: profile.displayName,
            senderAvatar: profile.avatarUrl,
            subject: m.subject,
            body: m.body,
            readAt: m.read_at,
            createdAt: m.created_at,
          };
        });
        setSentMessages(mapped);
      }
    } catch {
      // Non-fatal
    }
  }, [user, ensureProfiles]);

  // Fetch all users for compose (contacts)
  const fetchContacts = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    try {
      const { data, error } = await client
        .from('profiles')
        .select('id, email, display_name, avatar_url')
        .neq('id', user.id)
        .order('display_name', { ascending: true });

      if (!error && data) {
        setContacts(
          data.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            email: (p.email as string) || '',
            displayName: (p.display_name as string) || (p.email as string) || 'User',
            avatarUrl: (p.avatar_url as string) || null,
          })),
        );
      }
    } catch {
      // Non-fatal
    }
  }, [user]);

  // Mark a message as read
  const markAsRead = useCallback(async (messageId: string) => {
    const client = getSupabaseClient();
    if (!client) return;

    await client
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, readAt: new Date().toISOString() } : m,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Delete a single message (hard delete)
  const deleteMessage = useCallback(async (messageId: string, _type: 'inbox' | 'sent') => {
    const client = getSupabaseClient();
    if (!client) return;

    await client
      .from('direct_messages')
      .delete()
      .eq('id', messageId);

    if (_type === 'inbox') {
      setMessages((prev) => {
        const removed = prev.find((m) => m.id === messageId);
        if (removed && !removed.readAt) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return prev.filter((m) => m.id !== messageId);
      });
    } else {
      setSentMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  }, []);

  // Purge all inbox messages (hard delete)
  const purgeInbox = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    await client
      .from('direct_messages')
      .delete()
      .eq('recipient_id', user.id);

    setMessages([]);
    setUnreadCount(0);
  }, [user]);

  // Purge all sent messages (hard delete)
  const purgeSent = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    await client
      .from('direct_messages')
      .delete()
      .eq('sender_id', user.id);

    setSentMessages([]);
  }, [user]);

  // Send a message
  const sendMessage = useCallback(async (recipientId: string, subject: string, body: string) => {
    const client = getSupabaseClient();
    if (!client || !user) return { error: 'Not authenticated' };

    const { error } = await client
      .from('direct_messages')
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        subject,
        body,
      });

    if (error) return { error: error.message };

    // Await refresh so sent tab shows the new message
    await fetchSent();
    return { error: null };
  }, [user, fetchSent]);

  // Initial fetch
  useEffect(() => {
    if (mode !== 'authenticated' || !user) {
      setLoading(false);
      return;
    }
    fetchInbox();
    fetchSent();
    fetchContacts();
  }, [mode, user, fetchInbox, fetchSent, fetchContacts]);

  // Real-time subscription for new messages
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || mode !== 'authenticated' || !user) return;

    const channel = client
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          fetchInbox();
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [mode, user, fetchInbox]);

  return {
    messages,
    sentMessages,
    contacts,
    unreadCount,
    loading,
    markAsRead,
    deleteMessage,
    sendMessage,
    purgeInbox,
    purgeSent,
    refresh: () => { fetchInbox(); fetchSent(); },
  };
}
