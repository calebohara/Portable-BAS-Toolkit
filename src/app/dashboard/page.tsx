'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  FolderPlus, Upload, StickyNote, Database, Network, Pin,
  Clock, Star, ChevronRight, HardDrive, FolderKanban, Monitor, ArrowRight,
  Cloud, FileText, Settings, AlertTriangle, CheckCircle, History,
} from 'lucide-react';
import { useProjects, useRecentActivity, useProjectCounts, useRecentNotes } from '@/hooks/use-projects';
import { useAppStore } from '@/store/app-store';
import { getStorageEstimate } from '@/lib/db';
import { TopBar } from '@/components/layout/top-bar';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { formatFileSize } from '@/components/shared/file-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { navigateToProject } from '@/lib/routes';
import { useDeviceClass } from '@/hooks/use-device-class';
import { actionIcons } from '@/components/projects/activity-timeline';
import type { Project } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const { projects, loading } = useProjects();
  const recentProjectIds = useAppStore((s) => s.recentProjectIds);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const syncConflictCount = useAppStore((s) => s.syncConflictCount);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const { isWindowsDesktopWeb } = useDeviceClass();

  // New dashboard data hooks
  const { activity } = useRecentActivity(12);
  const { notes: recentNotes } = useRecentNotes(5);

  // Project entity counts (files/notes/devices per project)
  const allProjectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { counts: entityCounts } = useProjectCounts(allProjectIds);

  // Project name lookup for activity feed & notes
  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  useEffect(() => {
    getStorageEstimate().then(setStorage).catch(() => {});
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
    { icon: Upload, label: 'Upload File', onClick: () => router.push('/documents') },
    { icon: StickyNote, label: 'Field Note', onClick: () => router.push('/projects') },
    { icon: Database, label: 'Latest Backup', onClick: () => router.push('/search?q=backup&category=backups') },
    { icon: Network, label: 'IP Plan', onClick: () => router.push('/search?category=ip-plan') },
    { icon: Pin, label: 'Offline Files', onClick: () => router.push('/offline') },
  ];

  // Sync status display
  const syncStatusColor = {
    idle: 'bg-field-success',
    syncing: 'bg-primary animate-pulse',
    error: 'bg-field-danger',
    offline: 'bg-muted-foreground',
    disabled: 'bg-muted-foreground',
  }[syncStatus] ?? 'bg-muted-foreground';

  const syncStatusLabel = {
    idle: 'Synced',
    syncing: 'Syncing…',
    error: 'Sync Error',
    offline: 'Offline',
    disabled: 'Disabled',
  }[syncStatus] ?? '';

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="p-4 md:p-6 space-y-6">
        {/* Desktop App Banner — shown on Windows desktop browsers */}
        {isWindowsDesktopWeb && (
          <div
            className="relative overflow-hidden rounded-xl border border-primary/20"
            style={{ background: 'linear-gradient(135deg, var(--color-siemens-teal) 0%, var(--color-siemens-petrol) 100%)' }}
          >
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }} />
            <div className="relative flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-white/15 p-2.5">
                  <Monitor className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Desktop App for Windows — Coming Soon</p>
                  <p className="text-xs text-white/70">Native ICMP ping, full network access, and a focused workspace built with Tauri.</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => router.push('/desktop')}
                className="gap-1.5 shrink-0 bg-white/15 text-white border-white/20 hover:bg-white/25 backdrop-blur-sm"
                variant="outline"
              >
                Learn More <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-tour="quick-actions">
            {quickActions.map(({ icon: Icon, label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-all hover:bg-accent hover:border-primary/20 hover:shadow-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="rounded-lg bg-primary/10 p-1.5">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
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
                <ProjectCard key={project.id} project={project} counts={entityCounts.get(project.id)} onClick={() => {
                  useAppStore.getState().addRecentProject(project.id);
                  navigateToProject(router, project.id);
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
                <ProjectCard key={project.id} project={project} counts={entityCounts.get(project.id)} onClick={() => {
                  useAppStore.getState().addRecentProject(project.id);
                  navigateToProject(router, project.id);
                }} />
              ))}
            </div>
          </section>
        )}

        {/* ═══ Stats Grid ═══ */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Overview</h2>

          {/* Row 1: Core stats */}
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
            {/* Sync Status (replaces plain Local Storage) */}
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <Cloud className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${syncStatusColor}`} />
                    <p className="text-sm font-semibold">{syncStatusLabel}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {pendingSyncCount > 0 && <span className="text-field-warning">{pendingSyncCount} pending · </span>}
                    {lastSyncedAt
                      ? `${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}`
                      : 'Never synced'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Storage + Health */}
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-muted p-2.5">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatFileSize(storage.used)}</p>
                  <p className="text-xs text-muted-foreground">
                    Local Storage · {storage.quota > 0 ? `${((storage.used / storage.quota) * 100).toFixed(1)}% used` : '—'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg p-2.5 ${syncConflictCount > 0 ? 'bg-field-warning/10' : 'bg-field-success/10'}`}>
                  {syncConflictCount > 0
                    ? <AlertTriangle className="h-5 w-5 text-field-warning" />
                    : <CheckCircle className="h-5 w-5 text-field-success" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {syncConflictCount > 0
                      ? `${syncConflictCount} Conflict${syncConflictCount > 1 ? 's' : ''}`
                      : 'All Clear'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {syncConflictCount > 0 ? 'Review in Settings → Cloud & Sync' : 'No sync conflicts'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ═══ Activity Feed + Recent Notes (side by side on desktop) ═══ */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Activity Feed */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
            <Card>
              <CardContent className="p-0">
                {activity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <History className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No activity yet</p>
                    <p className="text-xs text-muted-foreground/60">Activity will appear as you work on projects.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                    {activity.map((entry) => {
                      const Icon = actionIcons[entry.action] || FileText;
                      const projectName = projectNameMap.get(entry.projectId) ?? 'Unknown';
                      return (
                        <button
                          key={entry.id}
                          onClick={() => navigateToProject(router, entry.projectId)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card mt-0.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{entry.action}</p>
                            <p className="text-xs text-muted-foreground truncate">{entry.details}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-medium text-primary truncate">{projectName}</span>
                              <span className="text-[10px] text-muted-foreground/60">·</span>
                              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Recent Field Notes */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Field Notes</h2>
            <Card>
              <CardContent className="p-0">
                {recentNotes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <StickyNote className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No field notes yet</p>
                    <p className="text-xs text-muted-foreground/60">Notes will appear here as you add them to projects.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                    {recentNotes.map((note) => {
                      const projectName = projectNameMap.get(note.projectId) ?? 'Unknown';
                      return (
                        <button
                          key={note.id}
                          onClick={() => navigateToProject(router, note.projectId)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card mt-0.5">
                            <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{note.content.slice(0, 80)}{note.content.length > 80 ? '…' : ''}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{note.category}</span>
                              <span className="text-[10px] text-muted-foreground/60">·</span>
                              <span className="text-[10px] font-medium text-primary truncate">{projectName}</span>
                              <span className="text-[10px] text-muted-foreground/60">·</span>
                              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Recently Opened Projects */}
        {recentProjects.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recently Opened</h2>
            <div className="space-y-1">
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    useAppStore.getState().addRecentProject(project.id);
                    navigateToProject(router, project.id);
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

/* ─── Project Card with entity counts ───────────────────── */

function ProjectCard({ project, onClick, counts }: {
  project: Project;
  onClick: () => void;
  counts?: { files: number; notes: number; devices: number };
}) {
  return (
    <Card role="button" tabIndex={0} className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}>
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
        {/* Entity counts */}
        {counts && (counts.files > 0 || counts.notes > 0 || counts.devices > 0) && (
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            {counts.files > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" /> {counts.files}
              </span>
            )}
            {counts.notes > 0 && (
              <span className="flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> {counts.notes}
              </span>
            )}
            {counts.devices > 0 && (
              <span className="flex items-center gap-1">
                <Settings className="h-3 w-3" /> {counts.devices}
              </span>
            )}
          </div>
        )}
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
