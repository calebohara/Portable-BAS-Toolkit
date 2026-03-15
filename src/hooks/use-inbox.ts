'use client';

import { useEffect, useState, useCallback } from 'react';
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

  // Fetch inbox messages
  const fetchInbox = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    try {
      // Use column-based FK resolution (safer than constraint name)
      const { data, error } = await client
        .from('direct_messages')
        .select(`
          id, sender_id, recipient_id, subject, body, read_at, created_at,
          sender:profiles!sender_id(display_name, avatar_url)
        `)
        .eq('recipient_id', user.id)
        .eq('deleted_by_recipient', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[inbox] Fetch inbox error:', error.message);
        return;
      }

      if (data) {
        const mapped: DirectMessage[] = data.map((m: Record<string, unknown>) => {
          const sender = m.sender as Record<string, unknown> | null;
          return {
            id: m.id as string,
            senderId: m.sender_id as string,
            recipientId: m.recipient_id as string,
            senderName: (sender?.display_name as string) || 'Unknown User',
            senderAvatar: (sender?.avatar_url as string) || null,
            subject: m.subject as string,
            body: m.body as string,
            readAt: m.read_at as string | null,
            createdAt: m.created_at as string,
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
  }, [user]);

  // Fetch sent messages
  const fetchSent = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !user) return;

    try {
      const { data, error } = await client
        .from('direct_messages')
        .select(`
          id, sender_id, recipient_id, subject, body, read_at, created_at,
          recipient:profiles!recipient_id(display_name, avatar_url)
        `)
        .eq('sender_id', user.id)
        .eq('deleted_by_sender', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[inbox] Fetch sent error:', error.message);
        return;
      }

      if (data) {
        const mapped: DirectMessage[] = data.map((m: Record<string, unknown>) => {
          const recipient = m.recipient as Record<string, unknown> | null;
          return {
            id: m.id as string,
            senderId: m.sender_id as string,
            recipientId: m.recipient_id as string,
            senderName: (recipient?.display_name as string) || 'Unknown User',
            senderAvatar: (recipient?.avatar_url as string) || null,
            subject: m.subject as string,
            body: m.body as string,
            readAt: m.read_at as string | null,
            createdAt: m.created_at as string,
          };
        });
        setSentMessages(mapped);
      }
    } catch {
      // Non-fatal
    }
  }, [user]);

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
