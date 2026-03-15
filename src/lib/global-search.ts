'use client';

import { getSupabaseClient } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GlobalSearchResult {
  sourceTable: 'projects' | 'notes' | 'devices' | 'ip_plan' | 'reports' | 'files' | 'messages';
  id: string;
  projectId: string | null;
  projectName: string | null;
  title: string;
  snippet: string;
  rank: number;
  createdAt: string;
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Call the Postgres search_global() RPC function via Supabase client.
 * Returns ranked results across all global tables.
 * Returns empty array if Supabase is not configured or user is not authenticated.
 */
export async function searchGlobalSupabase(
  query: string,
  limit = 30,
): Promise<GlobalSearchResult[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const { data, error } = await client.rpc('search_global', {
      search_query: trimmed,
      result_limit: limit,
    });

    if (error) {
      console.warn('[search] Global FTS error:', error.message);
      return [];
    }

    if (!data || !Array.isArray(data)) return [];

    return data.map((row: Record<string, unknown>) => ({
      sourceTable: row.source_table as GlobalSearchResult['sourceTable'],
      id: row.id as string,
      projectId: (row.project_id as string) || null,
      projectName: (row.project_name as string) || null,
      title: (row.title as string) || '',
      snippet: (row.snippet as string) || '',
      rank: (row.rank as number) || 0,
      createdAt: (row.created_at as string) || '',
    }));
  } catch (err) {
    console.warn('[search] Global FTS exception:', err);
    return [];
  }
}
