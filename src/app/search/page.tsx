'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Search, X, Clock, FolderKanban, FileText, StickyNote,
  Server, Network, ChevronRight,
} from 'lucide-react';
import { searchGlobal } from '@/lib/db';
import { useAppStore } from '@/store/app-store';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { ProjectStatusBadge, FileStatusBadge } from '@/components/shared/status-badge';
import { FileIcon, formatFileSize } from '@/components/shared/file-icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FILE_CATEGORY_LABELS } from '@/types';
import type { Project, ProjectFile, FieldNote, DeviceEntry, IpPlanEntry } from '@/types';

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{
    projects: Project[];
    files: ProjectFile[];
    notes: FieldNote[];
    devices: DeviceEntry[];
    ipEntries: IpPlanEntry[];
  } | null>(null);
  const recentSearches = useAppStore((s) => s.recentSearches);
  const addRecentSearch = useAppStore((s) => s.addRecentSearch);
  const clearRecentSearches = useAppStore((s) => s.clearRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); return; }
    setSearching(true);
    try {
      const res = await searchGlobal(q.trim());
      setResults(res);
      addRecentSearch(q.trim());
    } finally {
      setSearching(false);
    }
  }, [addRecentSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const totalResults = results
    ? results.projects.length + results.files.length + results.notes.length + results.devices.length + results.ipEntries.length
    : 0;

  // Quick jump chips
  const quickChips = [
    { label: 'Backups', query: 'backup' },
    { label: 'IP Plan', query: 'ip plan' },
    { label: 'Sequences', query: 'sequence' },
    { label: 'Panel DB', query: 'panel database' },
    { label: 'Wiring', query: 'wiring diagram' },
    { label: 'AHU', query: 'AHU' },
    { label: 'VAV', query: 'VAV' },
    { label: 'VFD', query: 'VFD' },
  ];

  const q = query.trim();

  return (
    <>
      <TopBar title="Search" />
      <div className="p-4 md:p-6 space-y-4 max-w-4xl">
        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search projects, files, devices, IP addresses, notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 pl-12 pr-10 text-base"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {/* Quick Jump Chips */}
        <div className="flex flex-wrap gap-1.5">
          {quickChips.map(({ label, query: chipQuery }) => (
            <button
              key={label}
              onClick={() => { setQuery(chipQuery); doSearch(chipQuery); }}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/20 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Recent Searches */}
        {!results && recentSearches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Recent Searches</h3>
              <Button variant="ghost" size="sm" onClick={clearRecentSearches} className="text-xs text-muted-foreground">
                Clear
              </Button>
            </div>
            <div className="space-y-1">
              {recentSearches.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); doSearch(s); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-accent"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {searching && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {/* Results */}
        {results && !searching && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {totalResults} result{totalResults !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
            </p>

            {/* Projects */}
            {results.projects.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <FolderKanban className="h-4 w-4 text-primary" /> Projects ({results.projects.length})
                </h3>
                <div className="space-y-2">
                  {results.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/projects/${p.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                    >
                      <FolderKanban className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium"><Highlight text={p.name} query={q} /></p>
                        <p className="truncate text-xs text-muted-foreground">
                          <Highlight text={`${p.customerName} — ${p.projectNumber}`} query={q} />
                        </p>
                      </div>
                      <ProjectStatusBadge status={p.status} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Files */}
            {results.files.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-blue-500" /> Files ({results.files.length})
                </h3>
                <div className="space-y-2">
                  {results.files.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => router.push(`/projects/${f.projectId}`)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                    >
                      <FileIcon fileType={f.fileType} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium"><Highlight text={f.title} query={q} /></p>
                        <p className="truncate text-xs text-muted-foreground">
                          <Highlight text={`${f.fileName} — ${FILE_CATEGORY_LABELS[f.category]}`} query={q} /> — {formatFileSize(f.size)}
                        </p>
                      </div>
                      <FileStatusBadge status={f.status} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Devices */}
            {results.devices.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Server className="h-4 w-4 text-amber-500" /> Devices ({results.devices.length})
                </h3>
                <div className="space-y-2">
                  {results.devices.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => router.push(`/projects/${d.projectId}`)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                    >
                      <Server className="h-5 w-5 text-amber-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-mono font-medium"><Highlight text={d.deviceName} query={q} /></p>
                        <p className="truncate text-xs text-muted-foreground">
                          <Highlight text={`${d.description} — ${d.system} — ${d.ipAddress || 'No IP'}`} query={q} />
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{d.status}</Badge>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* IP Entries */}
            {results.ipEntries.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Network className="h-4 w-4 text-green-500" /> IP Plan ({results.ipEntries.length})
                </h3>
                <div className="space-y-2">
                  {results.ipEntries.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => router.push(`/projects/${e.projectId}`)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                    >
                      <Network className="h-5 w-5 text-green-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-mono font-medium">
                          <Highlight text={`${e.ipAddress} — ${e.hostname}`} query={q} />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          <Highlight text={`${e.deviceRole} — VLAN ${e.vlan} — ${e.subnet}`} query={q} />
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Notes */}
            {results.notes.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <StickyNote className="h-4 w-4 text-yellow-500" /> Notes ({results.notes.length})
                </h3>
                <div className="space-y-2">
                  {results.notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => router.push(`/projects/${n.projectId}`)}
                      className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                    >
                      <StickyNote className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm line-clamp-2"><Highlight text={n.content} query={q} /></p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.author} — {format(new Date(n.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {totalResults === 0 && (
              <EmptyState
                icon={Search}
                title="No results found"
                description="Try different keywords or check your spelling."
              />
            )}
          </div>
        )}

        {/* Default empty state */}
        {!results && !searching && recentSearches.length === 0 && (
          <EmptyState
            icon={Search}
            title="Search your BAS projects"
            description="Find files, devices, IP addresses, notes, and more across all your projects."
          />
        )}
      </div>
    </>
  );
}
