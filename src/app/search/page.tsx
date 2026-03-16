'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Search, X, Clock, FolderKanban, FileText, StickyNote,
  Server, Network, ChevronRight, MessageSquare, Globe,
  HardDrive, ClipboardList,
} from 'lucide-react';
import { searchGlobal } from '@/lib/db';
import { searchGlobalSupabase } from '@/lib/global-search';
import type { GlobalSearchResult } from '@/lib/global-search';
import { useAppStore } from '@/store/app-store';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { ProjectStatusBadge, FileStatusBadge } from '@/components/shared/status-badge';
import { FileIcon, formatFileSize } from '@/components/shared/file-icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FILE_CATEGORY_LABELS } from '@/types';
import { navigateToProject, navigateToGlobalProject } from '@/lib/routes';
import type { Project, ProjectFile, FieldNote, DeviceEntry, IpPlanEntry } from '@/types';

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const splitRegex = new RegExp(`(${escaped})`, 'gi');
  const testRegex = new RegExp(`^${escaped}$`, 'i');
  const parts = text.split(splitRegex);
  return (
    <>
      {parts.map((part, i) =>
        testRegex.test(part)
          ? <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

// ─── Source table display config ─────────────────────────────────────────────

const SOURCE_TABLE_CONFIG: Record<GlobalSearchResult['sourceTable'], {
  label: string;
  icon: typeof FolderKanban;
  color: string;
}> = {
  projects: { label: 'Project', icon: FolderKanban, color: 'text-primary' },
  notes: { label: 'Note', icon: StickyNote, color: 'text-field-warning' },
  devices: { label: 'Device', icon: Server, color: 'text-field-warning' },
  ip_plan: { label: 'IP Plan', icon: Network, color: 'text-field-success' },
  reports: { label: 'Report', icon: ClipboardList, color: 'text-field-info' },
  files: { label: 'File', icon: FileText, color: 'text-field-info' },
  messages: { label: 'Message', icon: MessageSquare, color: 'text-primary' },
};

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [localResults, setLocalResults] = useState<{
    projects: Project[];
    files: ProjectFile[];
    notes: FieldNote[];
    devices: DeviceEntry[];
    ipEntries: IpPlanEntry[];
  } | null>(null);
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([]);
  const recentSearches = useAppStore((s) => s.recentSearches);
  const addRecentSearch = useAppStore((s) => s.addRecentSearch);
  const clearRecentSearches = useAppStore((s) => s.clearRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string, saveRecent = false) => {
    if (!q.trim()) {
      setLocalResults(null);
      setGlobalResults([]);
      return;
    }
    setSearching(true);
    try {
      // Run local IndexedDB search and global Postgres FTS in parallel
      const [local, global] = await Promise.all([
        searchGlobal(q.trim()),
        searchGlobalSupabase(q.trim()),
      ]);
      setLocalResults(local);
      setGlobalResults(global);
      if (saveRecent) addRecentSearch(q.trim());
    } finally {
      setSearching(false);
    }
  }, [addRecentSearch]);

  // Live search with debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setLocalResults(null); setGlobalResults([]); return; }
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(query, true);
  };

  const localCount = localResults
    ? localResults.projects.length + localResults.files.length + localResults.notes.length + localResults.devices.length + localResults.ipEntries.length
    : 0;
  const globalCount = globalResults.length;
  const totalResults = localCount + globalCount;

  const hasResults = localResults !== null || globalResults.length > 0;

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

  // Group global results by source table for organized display
  const groupedGlobal = globalResults.reduce<Record<string, GlobalSearchResult[]>>((acc, r) => {
    const key = r.sourceTable;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // Order for global result sections
  const globalSectionOrder: GlobalSearchResult['sourceTable'][] = [
    'projects', 'files', 'devices', 'ip_plan', 'reports', 'notes', 'messages',
  ];

  return (
    <>
      <TopBar title="Search" />
      <div className="p-4 md:p-6 space-y-4 max-w-4xl">
        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search projects, files, devices, IP addresses, notes, messages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 pl-12 pr-10 text-base"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setLocalResults(null); setGlobalResults([]); inputRef.current?.focus(); }}
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
              onClick={() => { setQuery(chipQuery); doSearch(chipQuery, true); }}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/20 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Recent Searches */}
        {!hasResults && !query.trim() && recentSearches.length > 0 && (
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
                  onClick={() => { setQuery(s); doSearch(s, true); }}
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
        {hasResults && !searching && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {totalResults} result{totalResults !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
              {localCount > 0 && globalCount > 0 && (
                <span className="ml-1">
                  ({localCount} local, {globalCount} global)
                </span>
              )}
            </p>

            {/* ─── Local Results ─────────────────────────────────────────── */}
            {localCount > 0 && (
              <>
                {globalCount > 0 && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <HardDrive className="h-3.5 w-3.5" />
                    Local Projects
                  </div>
                )}

                {/* Projects */}
                {localResults && localResults.projects.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <FolderKanban className="h-4 w-4 text-primary" /> Projects ({localResults.projects.length})
                    </h3>
                    <div className="space-y-2">
                      {localResults.projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => navigateToProject(router, p.id)}
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
                {localResults && localResults.files.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4 text-field-info" /> Files ({localResults.files.length})
                    </h3>
                    <div className="space-y-2">
                      {localResults.files.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => navigateToProject(router, f.projectId, f.category)}
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
                {localResults && localResults.devices.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Server className="h-4 w-4 text-field-warning" /> Devices ({localResults.devices.length})
                    </h3>
                    <div className="space-y-2">
                      {localResults.devices.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => navigateToProject(router, d.projectId, 'device-list')}
                          className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                        >
                          <Server className="h-5 w-5 text-field-warning shrink-0" />
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
                {localResults && localResults.ipEntries.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Network className="h-4 w-4 text-field-success" /> IP Plan ({localResults.ipEntries.length})
                    </h3>
                    <div className="space-y-2">
                      {localResults.ipEntries.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => navigateToProject(router, e.projectId, 'ip-plan')}
                          className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                        >
                          <Network className="h-5 w-5 text-field-success shrink-0" />
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
                {localResults && localResults.notes.length > 0 && (
                  <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <StickyNote className="h-4 w-4 text-field-warning" /> Notes ({localResults.notes.length})
                    </h3>
                    <div className="space-y-2">
                      {localResults.notes.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => navigateToProject(router, n.projectId, 'notes')}
                          className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                        >
                          <StickyNote className="h-5 w-5 text-field-warning shrink-0 mt-0.5" />
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
              </>
            )}

            {/* ─── Global Results (Postgres FTS) ────────────────────────── */}
            {globalCount > 0 && (
              <>
                {localCount > 0 && <div className="border-t border-border" />}

                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Globe className="h-3.5 w-3.5" />
                  Global Projects
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    Server FTS
                  </Badge>
                </div>

                {globalSectionOrder.map((sourceTable) => {
                  const items = groupedGlobal[sourceTable];
                  if (!items || items.length === 0) return null;
                  const config = SOURCE_TABLE_CONFIG[sourceTable];
                  const Icon = config.icon;

                  return (
                    <section key={sourceTable}>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <Icon className={`h-4 w-4 ${config.color}`} />
                        {config.label}s ({items.length})
                      </h3>
                      <div className="space-y-2">
                        {items.map((r) => (
                          <button
                            key={`${r.sourceTable}-${r.id}`}
                            onClick={() => {
                              if (r.projectId) {
                                // Navigate to the global project, with tab context
                                const tabMap: Record<string, string> = {
                                  notes: 'notes',
                                  devices: 'device-list',
                                  ip_plan: 'ip-plan',
                                  reports: 'reports',
                                  files: 'documents',
                                  messages: 'messages',
                                };
                                const tab = tabMap[r.sourceTable] || '';
                                navigateToGlobalProject(router, r.projectId, tab || undefined);
                              } else if (r.sourceTable === 'messages') {
                                router.push('/global-projects');
                              }
                            }}
                            className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
                          >
                            <Icon className={`h-5 w-5 ${config.color} shrink-0 mt-0.5`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                <Highlight text={r.title} query={q} />
                              </p>
                              {r.snippet && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                  <Highlight text={r.snippet} query={q} />
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                {r.projectName && (
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    {r.projectName}
                                  </Badge>
                                )}
                                {r.createdAt && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(r.createdAt), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </>
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
        {!hasResults && !searching && !query.trim() && recentSearches.length === 0 && (
          <EmptyState
            icon={Search}
            title="Search your BAS projects"
            description="Find files, devices, IP addresses, notes, messages, and more across local and global projects."
          />
        )}
      </div>
    </>
  );
}
