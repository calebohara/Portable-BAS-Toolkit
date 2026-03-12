'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pin, WifiOff, HardDrive, Trash2, FolderKanban, ChevronRight, PinOff, Wifi,
} from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { getStorageEstimate, clearFileCache } from '@/lib/db';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/store/app-store';
import { formatFileSize } from '@/components/shared/file-icon';
import { navigateToProject } from '@/lib/routes';
import { toast } from 'sonner';

export default function OfflinePage() {
  const router = useRouter();
  const { projects, loading, updateProject } = useProjects();
  const isOnline = useAppStore((s) => s.isOnline);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    getStorageEstimate().then(setStorage).catch(() => {});
  }, []);

  const offlineProjects = projects.filter((p) => p.isOfflineAvailable);
  const pinnedProjects = projects.filter((p) => p.isPinned);
  // Deduplicate: show projects that are pinned but not already in offline
  const pinnedOnly = pinnedProjects.filter((p) => !p.isOfflineAvailable);
  const storagePercent = storage.quota > 0 ? (storage.used / storage.quota) * 100 : 0;

  const handleClearCache = async () => {
    const count = await clearFileCache();
    toast.success(`Cleared ${count} cached files`);
    getStorageEstimate().then(setStorage).catch(() => {});
  };

  const togglePin = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const wasPinned = project.isPinned;
    await updateProject({ ...project, isPinned: !wasPinned });
    toast.success(wasPinned ? 'Project unpinned' : 'Project pinned');
  };

  const toggleOffline = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const wasOffline = project.isOfflineAvailable;
    await updateProject({ ...project, isOfflineAvailable: !wasOffline });
    toast.success(wasOffline ? 'Removed from offline' : 'Available offline');
  };

  return (
    <>
      <TopBar title="Offline & Pinned" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        {/* Status */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-4">
              {isOnline ? (
                <>
                  <div className="h-3 w-3 rounded-full bg-field-success animate-pulse" />
                  <span className="text-sm font-medium">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-field-warning" />
                  <span className="text-sm font-medium text-field-warning">Offline Mode</span>
                </>
              )}
            </div>

            {/* Storage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <HardDrive className="h-4 w-4" /> Local Storage
                </span>
                <span className="font-medium">{formatFileSize(storage.used)} / {formatFileSize(storage.quota)}</span>
              </div>
              <Progress value={storagePercent} className="h-2" />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{storagePercent.toFixed(1)}% used</p>
                <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(true)} className="gap-1.5 text-xs">
                  <Trash2 className="h-3 w-3" /> Clear File Cache
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Offline Available Projects */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <WifiOff className="h-4 w-4" /> Offline Available Projects
          </h2>
          {offlineProjects.length === 0 ? (
            <EmptyState
              icon={WifiOff}
              title="No offline projects"
              description="Mark projects as offline-available to access them without internet."
            />
          ) : (
            <div className="space-y-2">
              {offlineProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors"
                >
                  <button
                    onClick={() => navigateToProject(router, project.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <FolderKanban className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{project.customerName} — {project.projectNumber}</p>
                    </div>
                    <ProjectStatusBadge status={project.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      title={project.isPinned ? 'Unpin' : 'Pin'}
                      onClick={() => togglePin(project.id)}
                    >
                      {project.isPinned ? <PinOff className="h-3.5 w-3.5 text-primary" /> : <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      title="Remove from offline"
                      onClick={() => toggleOffline(project.id)}
                    >
                      <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pinned Projects (only those not already in offline) */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Pin className="h-4 w-4" /> Pinned Projects
          </h2>
          {pinnedOnly.length === 0 && pinnedProjects.length > 0 ? (
            <p className="text-sm text-muted-foreground">All pinned projects are shown in the offline section above.</p>
          ) : pinnedOnly.length === 0 ? (
            <EmptyState
              icon={Pin}
              title="No pinned projects"
              description="Pin projects for quick access."
            />
          ) : (
            <div className="space-y-2">
              {pinnedOnly.map((project) => (
                <div
                  key={project.id}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors"
                >
                  <button
                    onClick={() => navigateToProject(router, project.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <Pin className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{project.customerName}</p>
                    </div>
                    <ProjectStatusBadge status={project.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      title="Unpin"
                      onClick={() => togglePin(project.id)}
                    >
                      <PinOff className="h-3.5 w-3.5 text-primary" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      title="Make offline available"
                      onClick={() => toggleOffline(project.id)}
                    >
                      <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear File Cache"
        description="All cached file previews will be removed. Your project data and notes are preserved."
        confirmLabel="Clear Cache"
        variant="destructive"
        onConfirm={handleClearCache}
      />
    </>
  );
}
