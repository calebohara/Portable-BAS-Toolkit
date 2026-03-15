'use client';

import { useState, useCallback, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  fetchKbCategories,
  fetchKbArticles,
  createKbCategory,
  createKbArticle,
  deleteKbArticle,
  addKbReply,
  deleteKbReply,
} from '@/lib/knowledge-base/api';
import type { KbCategory, KbArticle, KbAttachment } from '@/types/knowledge-base';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function unwrap<T>(result: { data: T; error: null } | { data: null; error: string }): T {
  if (result.error !== null) throw new Error(result.error);
  return result.data;
}

function useRealtimeRefresh(table: string, refresh: () => void) {
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    const channel = client
      .channel(`rt-kb-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [table, refresh]);
}

// ─── Categories Hook ─────────────────────────────────────────────────────────

export function useKbCategories() {
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = unwrap(await fetchKbCategories());
      setCategories(data);
    } catch {
      // silent — categories will be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtimeRefresh('kb_categories', refresh);

  const addCategory = useCallback(
    async (name: string) => {
      const cat = unwrap(await createKbCategory(name));
      await refresh();
      return cat;
    },
    [refresh],
  );

  return { categories, loading, refresh, addCategory };
}

// ─── Articles Hook ───────────────────────────────────────────────────────────

export function useKbArticles() {
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = unwrap(await fetchKbArticles());
      setArticles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch articles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtimeRefresh('kb_articles', refresh);
  useRealtimeRefresh('kb_replies', refresh);

  const postArticle = useCallback(
    async (subject: string, body: string, categoryId: string, attachments?: KbAttachment[]) => {
      const article = unwrap(await createKbArticle(subject, body, categoryId, attachments));
      await refresh();
      return article;
    },
    [refresh],
  );

  const removeArticle = useCallback(
    async (articleId: string) => {
      unwrap(await deleteKbArticle(articleId));
      await refresh();
    },
    [refresh],
  );

  const replyToArticle = useCallback(
    async (articleId: string, body: string) => {
      const reply = unwrap(await addKbReply(articleId, body));
      await refresh();
      return reply;
    },
    [refresh],
  );

  const removeReply = useCallback(
    async (replyId: string) => {
      unwrap(await deleteKbReply(replyId));
      await refresh();
    },
    [refresh],
  );

  return {
    articles,
    loading,
    error,
    refresh,
    postArticle,
    removeArticle,
    replyToArticle,
    removeReply,
  };
}
