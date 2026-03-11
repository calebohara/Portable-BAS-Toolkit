'use client';

import { useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus, Search, Filter, Pin, MapPin, Hash, Trash2,
} from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useAppStore } from '@/store/app-store';
import { TopBar } from '@/components/layout/top-bar';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';
import { toast } from 'sonner';
import { navigateToProject } from '@/lib/routes';
import type { Project, ProjectStatus } from '@/types';

export default function ProjectsPage() {
  return (
    <Suspense fallback={<><TopBar title="Projects" /><div className="flex items-center justify-center p-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div></>}>
      <ProjectsPageInner />
    </Suspense>
  );
}

function ProjectsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects, loading, createProject, removeProject } = useProjects();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [showNewDialog, setShowNewDialog] = useState(searchParams.get('new') === '1');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeProject(deleteTarget.id);
      useAppStore.getState().removeRecentProject(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    let result = projects;
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        p.projectNumber.toLowerCase().includes(q) ||
        p.siteAddress.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [projects, search, statusFilter]);

  const statuses: { value: ProjectStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'on-hold', label: 'On Hold' },
    { value: 'completed', label: 'Completed' },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <>
      <TopBar title="Projects" />
      <div className="p-4 md:p-6 space-y-4">
        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
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
            <Button onClick={() => setShowNewDialog(true)} size="sm" className="gap-1.5">
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
            icon={search ? Search : Filter}
            title={search ? 'No matching projects' : 'No projects yet'}
            description={search ? 'Try adjusting your search or filters.' : 'Create your first project to get started.'}
            action={!search ? (
              <Button onClick={() => setShowNewDialog(true)} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <Card
                key={project.id}
                className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/20"
                onClick={() => {
                  useAppStore.getState().addRecentProject(project.id);
                  navigateToProject(router, project.id);
                }}
              >
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {project.isPinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                        <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{project.customerName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ProjectStatusBadge status={project.status} />
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                        className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                        title="Delete project"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Hash className="h-3 w-3" />
                      <span className="truncate">{project.projectNumber}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{project.siteAddress}</span>
                    </div>
                    <p>Updated {format(new Date(project.updatedAt), 'MMM d, yyyy')}</p>
                  </div>

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

                  {project.isOfflineAvailable && (
                    <div className="mt-2 text-[10px] font-medium text-field-info">
                      Offline Ready
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <NewProjectDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreate={async (data) => {
          const project = await createProject(data);
          setShowNewDialog(false);
          navigateToProject(router, project.id);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Project"
        description={deleteTarget ? `Permanently delete "${deleteTarget.name}" (${deleteTarget.projectNumber})? All files, notes, devices, and IP plan entries will be removed. This cannot be undone.` : ''}
        confirmLabel={deleting ? 'Deleting...' : 'Delete Project'}
        variant="destructive"
        onConfirm={handleDeleteProject}
      />
    </>
  );
}
