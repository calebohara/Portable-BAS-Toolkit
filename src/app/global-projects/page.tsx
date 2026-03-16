'use client';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus, Search, MapPin, Users, Globe, LogIn, MessageSquare, FolderOpen,
} from 'lucide-react';
import { useGlobalProjects } from '@/hooks/use-global-projects';
import { TopBar } from '@/components/layout/top-bar';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreateGlobalProjectDialog } from '@/components/global-projects/create-global-project-dialog';
import { JoinGlobalProjectDialog } from '@/components/global-projects/join-global-project-dialog';
import { MessageBoard } from '@/components/global-projects/message-board';
import { navigateToGlobalProject } from '@/lib/routes';
import type { GlobalProjectStatus } from '@/types/global-projects';

export default function GlobalProjectsPage() {
  return (
    <Suspense fallback={<><TopBar title="Global Projects" /><div className="flex items-center justify-center p-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div></>}>
      <GlobalProjectsPageInner />
    </Suspense>
  );
}

type PageTab = 'projects' | 'board';

function GlobalProjectsPageInner() {
  const router = useRouter();
  const { projects, loading, createProject, joinProject } = useGlobalProjects();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GlobalProjectStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<PageTab>('projects');
  const [unreadCount, setUnreadCount] = useState(0);
  const handleUnreadChange = useCallback((count: number) => setUnreadCount(count), []);

  const filtered = useMemo(() => {
    let result = projects;
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.jobSiteName.toLowerCase().includes(q) ||
        (p.siteAddress || '').toLowerCase().includes(q) ||
        (p.projectNumber || '').toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [projects, search, statusFilter]);

  const statuses: { value: GlobalProjectStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'on-hold', label: 'On Hold' },
    { value: 'completed', label: 'Completed' },
    { value: 'archived', label: 'Archived' },
  ];

  const tabs: { value: PageTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'projects', label: 'Projects', icon: FolderOpen },
    { value: 'board', label: 'Message Board', icon: MessageSquare },
  ];

  return (
    <>
      <TopBar title="Global Projects" />
      <div className="p-4 md:p-6 space-y-4">
        {/* Page Tabs */}
        <div className="flex items-center gap-4 border-b border-border">
          {tabs.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`flex items-center gap-1.5 pb-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {value === 'board' && unreadCount > 0 && activeTab !== 'board' && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'projects' && (
          <>
            {/* Controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search global projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
                  {statuses.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setStatusFilter(value)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        statusFilter === value
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowJoinDialog(true)}
                >
                  <LogIn className="h-4 w-4" />
                  <span className="hidden sm:inline">Join</span>
                </Button>
                <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Project</span>
                </Button>
              </div>
            </div>

            {/* Project List */}
            {loading ? (
              <div className="flex items-center justify-center p-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={search ? Search : Globe}
                title={search ? 'No matching projects' : 'No global projects yet'}
                description={search ? 'Try adjusting your search or filters.' : 'Create a new global project or join an existing one with an access code.'}
                action={!search ? (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setShowJoinDialog(true)} size="sm" className="gap-1.5">
                      <LogIn className="h-4 w-4" /> Join Project
                    </Button>
                    <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" /> New Project
                    </Button>
                  </div>
                ) : undefined}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((project) => (
                  <Card
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    className="group cursor-pointer border-l-4 border-l-blue-500 transition-all hover:shadow-md hover:border-primary/20 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => navigateToGlobalProject(router, project.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToGlobalProject(router, project.id); } }}
                  >
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                          <p className="truncate text-xs text-muted-foreground">{project.jobSiteName}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ProjectStatusBadge status={project.status} />
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        {project.siteAddress && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{project.siteAddress}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3" />
                            <span>{project.memberCount ?? 1} member{(project.memberCount ?? 1) !== 1 ? 's' : ''}</span>
                          </div>
                          {project.role && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {project.role === 'admin' ? 'Admin' : 'Member'}
                            </Badge>
                          )}
                        </div>
                        <p>Updated {format(new Date(project.updatedAt), 'MMM d, yyyy')}</p>
                      </div>

                      {project.tags.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {project.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                          {project.tags.length > 3 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              +{project.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'board' && (
          <div className="max-w-3xl">
            <MessageBoard projects={projects} onUnreadChange={handleUnreadChange} />
          </div>
        )}
      </div>

      <CreateGlobalProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={async (data) => {
          return await createProject(data);
        }}
      />

      <JoinGlobalProjectDialog
        open={showJoinDialog}
        onOpenChange={setShowJoinDialog}
        onJoin={async (code) => {
          const result = await joinProject(code);
          // Handle ApiResult wrapper
          if (result && 'error' in result && result.error) {
            return { error: result.error };
          }
          if (result && 'data' in result && result.data) {
            return result.data as any;
          }
          return result as any;
        }}
        onNavigate={(id) => navigateToGlobalProject(router, id)}
      />
    </>
  );
}
