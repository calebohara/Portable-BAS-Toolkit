'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  FolderPlus, Upload, StickyNote, Database, Network, Pin,
  Clock, Star, ChevronRight, HardDrive, FolderKanban,
} from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useAppStore } from '@/store/app-store';
import { getStorageEstimate } from '@/lib/db';
import { TopBar } from '@/components/layout/top-bar';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { formatFileSize } from '@/components/shared/file-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Project } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const { projects, loading } = useProjects();
  const recentProjectIds = useAppStore((s) => s.recentProjectIds);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });

  useEffect(() => {
    getStorageEstimate().then(setStorage);
  }, []);

  if (loading) {
    return (
      <>
        <TopBar title="Dashboard" />
        <div className="flex items-center justify-center p-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </>
    );
  }

  const pinnedIds = new Set(projects.filter((p) => p.isPinned).map((p) => p.id));
  const pinnedProjects = projects.filter((p) => p.isPinned);
  const recentProjects = recentProjectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p)
    .slice(0, 5);
  // Exclude pinned projects from active list to avoid duplication
  const activeProjects = projects.filter((p) => p.status === 'active' && !pinnedIds.has(p.id));
  const offlineProjects = projects.filter((p) => p.isOfflineAvailable);

  const quickActions = [
    { icon: FolderPlus, label: 'New Project', onClick: () => router.push('/projects?new=1') },
    { icon: Upload, label: 'Upload File', onClick: () => router.push('/projects') },
    { icon: StickyNote, label: 'Field Note', onClick: () => router.push('/projects') },
    { icon: Database, label: 'Latest Backup', onClick: () => router.push('/search?q=backup&category=backups') },
    { icon: Network, label: 'IP Plan', onClick: () => router.push('/search?category=ip-plan') },
    { icon: Pin, label: 'Offline Files', onClick: () => router.push('/offline') },
  ];

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="p-4 md:p-6 space-y-6">
        {/* Quick Actions */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-tour="quick-actions">
            {quickActions.map(({ icon: Icon, label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-colors hover:bg-accent hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Pinned Projects */}
        {pinnedProjects.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pinned Projects</h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/projects')} className="text-xs text-muted-foreground">
                View All <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pinnedProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onClick={() => {
                  useAppStore.getState().addRecentProject(project.id);
                  router.push(`/projects/${project.id}`);
                }} />
              ))}
            </div>
          </section>
        )}

        {/* Active Projects (excluding pinned to avoid duplication) */}
        {activeProjects.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Projects</h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/projects')} className="text-xs text-muted-foreground">
                View All <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeProjects.slice(0, 6).map((project) => (
                <ProjectCard key={project.id} project={project} onClick={() => {
                  useAppStore.getState().addRecentProject(project.id);
                  router.push(`/projects/${project.id}`);
                }} />
              ))}
            </div>
          </section>
        )}

        {/* Stats Row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <FolderKanban className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{projects.length}</p>
                <p className="text-xs text-muted-foreground">Total Projects</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-field-success/10 p-2.5">
                <Star className="h-5 w-5 text-field-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{projects.filter((p) => p.status === 'active').length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-field-info/10 p-2.5">
                <Pin className="h-5 w-5 text-field-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{offlineProjects.length}</p>
                <p className="text-xs text-muted-foreground">Offline Ready</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-muted p-2.5">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatFileSize(storage.used)}</p>
                <p className="text-xs text-muted-foreground">Local Storage</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recently Opened</h2>
            <div className="space-y-1">
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    useAppStore.getState().addRecentProject(project.id);
                    router.push(`/projects/${project.id}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{project.customerName} — {project.projectNumber}</p>
                  </div>
                  <ProjectStatusBadge status={project.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20" onClick={onClick}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{project.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{project.customerName}</p>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="truncate">{project.projectNumber} — {project.buildingArea}</p>
          <p>Updated {format(new Date(project.updatedAt), 'MMM d, yyyy')}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
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
        <div className="mt-2 flex items-center gap-2">
          {project.isPinned && <Pin className="h-3 w-3 text-primary" />}
          {project.isOfflineAvailable && (
            <span className="text-[10px] text-field-info font-medium">Offline Ready</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
