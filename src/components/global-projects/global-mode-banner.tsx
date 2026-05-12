'use client';

import { useRouter } from 'next/navigation';
import { Globe, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGlobalProject } from '@/hooks/use-global-projects';

/**
 * Visual indicator shown at the top of a standalone tool page (PID tuning,
 * psychrometric, register, ping, trend, …) when the user navigated in from a
 * Global Project (`?globalProjectId=<id>`). Makes it obvious that data on
 * this page is being read from and written to the *global* child tables for
 * that project, not the user's local IndexedDB.
 *
 * Renders nothing if `globalProjectId` is empty / undefined — safe to drop in
 * unconditionally.
 */
export function GlobalModeBanner({ globalProjectId }: { globalProjectId: string | undefined }) {
  const router = useRouter();
  // Hook must be called unconditionally; the hook itself short-circuits on
  // empty id and returns `project: null`.
  const { project, loading } = useGlobalProject(globalProjectId);

  if (!globalProjectId) return null;

  // If the global project can't be loaded (not a member, deleted, network
  // error), surface a warning rather than silently falling back. The data
  // hooks behind the banner will also return empty + an error, so the
  // page itself will look empty — the banner explains why.
  if (!loading && !project) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-amber-700 dark:text-amber-400">
          Global project not found or you no longer have access (id:{' '}
          <code className="font-mono text-xs">{globalProjectId.slice(0, 8)}…</code>).
        </span>
        <Button
          variant="link"
          size="sm"
          className="ml-auto h-auto px-0 py-0 text-xs"
          onClick={() => router.push('/global-projects')}
        >
          Browse projects
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex items-center gap-2">
      <Globe className="h-4 w-4 text-primary shrink-0" />
      <span className="min-w-0 truncate">
        Working in global project:{' '}
        <strong className="font-semibold">
          {project?.name ?? (loading ? 'Loading…' : globalProjectId.slice(0, 8))}
        </strong>
        {project?.accessCode && (
          <span className="ml-2 text-muted-foreground">
            (<code className="font-mono text-xs">{project.accessCode}</code>)
          </span>
        )}
      </span>
      <Button
        variant="link"
        size="sm"
        className="ml-auto h-auto px-0 py-0 text-xs gap-1 shrink-0"
        onClick={() => router.push(`/global-projects/${globalProjectId}`)}
      >
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Button>
    </div>
  );
}
