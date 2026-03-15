'use client';

import { getSupabaseClient } from '@/lib/supabase/client';
import type { KbCategory, KbArticle, KbReply, KbAttachment } from '@/types/knowledge-base';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelCaseKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => camelCaseKeys<T>(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      converted[toCamelCase(key)] = value;
    }
    return converted as T;
  }
  return obj as T;
}

function getClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

// ─── Profile helpers ─────────────────────────────────────────────────────────

interface ProfileInfo {
  display_name: string | null;
  avatar_url: string | null;
}

async function fetchProfileMap(userIds: string[]): Promise<Record<string, ProfileInfo>> {
  if (userIds.length === 0) return {};
  const supabase = getClient();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', [...new Set(userIds)]);
  const map: Record<string, ProfileInfo> = {};
  for (const p of profiles || []) {
    map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url ?? null };
  }
  return map;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function fetchKbCategories(): Promise<Result<KbCategory[]>> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('kb_categories')
      .select('*')
      .order('name');
    if (error) return { data: null, error: error.message };
    return { data: (data || []).map((r) => camelCaseKeys<KbCategory>(r)), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch categories' };
  }
}

export async function createKbCategory(name: string): Promise<Result<KbCategory>> {
  try {
    const supabase = getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('kb_categories')
      .insert({ name: name.trim(), created_by: user.id })
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    return { data: camelCaseKeys<KbCategory>(data), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to create category' };
  }
}

// ─── Articles ────────────────────────────────────────────────────────────────

export async function fetchKbArticles(): Promise<Result<KbArticle[]>> {
  try {
    const supabase = getClient();

    // Fetch articles with category name
    const { data, error } = await supabase
      .from('kb_articles')
      .select('*, kb_categories(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };

    // Fetch replies
    const articleIds = (data || []).map((a) => a.id);
    let replies: KbReply[] = [];
    if (articleIds.length > 0) {
      const { data: replyData } = await supabase
        .from('kb_replies')
        .select('*')
        .in('article_id', articleIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      replies = (replyData || []).map((r) => camelCaseKeys<KbReply>(r));
    }

    // Collect all user IDs for profile lookup
    const allUserIds = [
      ...(data || []).map((a) => a.created_by),
      ...replies.map((r) => r.createdBy),
    ];
    const profileMap = await fetchProfileMap(allUserIds);

    // Build reply map
    const replyMap = new Map<string, KbReply[]>();
    for (const r of replies) {
      const profile = profileMap[r.createdBy];
      r.authorName = profile?.display_name ?? null;
      r.authorAvatarUrl = profile?.avatar_url ?? null;
      const existing = replyMap.get(r.articleId) || [];
      existing.push(r);
      replyMap.set(r.articleId, existing);
    }

    // Map articles
    const articles: KbArticle[] = (data || []).map((row) => {
      const article = camelCaseKeys<KbArticle>(row);
      const profile = profileMap[row.created_by];
      article.authorName = profile?.display_name ?? null;
      article.authorAvatarUrl = profile?.avatar_url ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      article.categoryName = (row as any).kb_categories?.name ?? 'Uncategorized';
      article.replies = replyMap.get(article.id) || [];
      article.replyCount = article.replies.length;
      // Parse attachments from JSONB
      article.attachments = Array.isArray(row.attachments) ? row.attachments : [];
      return article;
    });

    return { data: articles, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch articles' };
  }
}

export async function createKbArticle(
  subject: string,
  body: string,
  categoryId: string,
  attachments: KbAttachment[] = [],
): Promise<Result<KbArticle>> {
  try {
    const supabase = getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('kb_articles')
      .insert({
        subject: subject.trim(),
        body: body.trim(),
        category_id: categoryId,
        created_by: user.id,
        attachments: JSON.stringify(attachments),
      })
      .select('*, kb_categories(name)')
      .single();
    if (error) return { data: null, error: error.message };

    const article = camelCaseKeys<KbArticle>(data);
    const profileMap = await fetchProfileMap([user.id]);
    const profile = profileMap[user.id];
    article.authorName = profile?.display_name ?? null;
    article.authorAvatarUrl = profile?.avatar_url ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    article.categoryName = (data as any).kb_categories?.name ?? 'Uncategorized';
    article.attachments = attachments;
    article.replies = [];
    article.replyCount = 0;
    return { data: article, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to create article' };
  }
}

export async function deleteKbArticle(articleId: string): Promise<Result<void>> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from('kb_articles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', articleId);
    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to delete article' };
  }
}

// ─── Replies ─────────────────────────────────────────────────────────────────

export async function addKbReply(articleId: string, body: string): Promise<Result<KbReply>> {
  try {
    const supabase = getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('kb_replies')
      .insert({ article_id: articleId, body: body.trim(), created_by: user.id })
      .select()
      .single();
    if (error) return { data: null, error: error.message };

    const reply = camelCaseKeys<KbReply>(data);
    const profileMap = await fetchProfileMap([user.id]);
    const profile = profileMap[user.id];
    reply.authorName = profile?.display_name ?? null;
    reply.authorAvatarUrl = profile?.avatar_url ?? null;
    return { data: reply, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to add reply' };
  }
}

export async function deleteKbReply(replyId: string): Promise<Result<void>> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from('kb_replies')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', replyId);
    if (error) return { data: null, error: error.message };
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to delete reply' };
  }
}
