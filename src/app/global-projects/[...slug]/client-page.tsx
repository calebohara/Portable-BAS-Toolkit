'use client';

import { useState, useMemo, use, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft, LayoutGrid, StickyNote, Server, Network, FileText, FolderOpen,
  History, Users, Plus, Trash2, Edit2, MapPin, Hash, Building2,
  Copy, Check, Clock, User, ChevronDown, ChevronUp, Pencil, FolderKanban,
  Upload, X, ExternalLink,
} from 'lucide-react';
import {
  validateFileSize, isImageFile, buildStoragePath, uploadProjectFile,
  getPublicUrl, formatBytes,
} from '@/lib/storage';
import {
  useGlobalProject,
  useGlobalProjectMembers,
  useGlobalProjectNotes,
  useGlobalProjectDevices,
  useGlobalProjectIpPlan,
  useGlobalProjectFiles,
  useGlobalProjectReports,
  useGlobalProjectActivity,
} from '@/hooks/use-global-projects';
import { useAuth } from '@/providers/auth-provider';
import { TopBar } from '@/components/layout/top-bar';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { MemberManagement } from '@/components/global-projects/member-management';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SaveToLocalDialog } from '@/components/global-projects/save-to-local-dialog';
import { navigateToProject } from '@/lib/routes';
import { cn, copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  GlobalProject,
  GlobalProjectStatus,
  GlobalFieldNote,
  GlobalDevice,
  GlobalDeviceStatus,
  GlobalIpPlanEntry,
  GlobalProjectFile,
  GlobalDailyReport,
  GlobalActivityLogEntry,
} from '@/types/global-projects';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'devices', label: 'Devices', icon: Server },
  { id: 'ip-plan', label: 'IP Plan', icon: Network },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'members', label: 'Members', icon: Users },
] as const;

export default function GlobalProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = use(params);
  const id = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('_id') || paramId)
    : paramId;
  const router = useRouter();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';

  const { project, loading, update: updateProject, remove: removeProject, leave: leaveProject } = useGlobalProject(id);
  const { members, removeMember, promoteMember, regenerateCode } = useGlobalProjectMembers(id);
  const { notes, addNote, updateNote, removeNote } = useGlobalProjectNotes(id);
  const { devices, addDevice, updateDevice, removeDevice } = useGlobalProjectDevices(id);
  const { entries: ipEntries, addEntry: addIpEntry, updateEntry: updateIpEntry, removeEntry: removeIpEntry } = useGlobalProjectIpPlan(id);
  const { files, addFile, updateFile, removeFile } = useGlobalProjectFiles(id);
  const { reports, updateReport, removeReport } = useGlobalProjectReports(id);
  const { activity } = useGlobalProjectActivity(id);

  const getInitialTab = () => {
    if (typeof window === 'undefined') return 'overview';
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const validTabs: string[] = tabs.map((t) => t.id);
    return tab && validTabs.includes(tab) ? tab : 'overview';
  };

  const [activeTab, setActiveTabState] = useState(getInitialTab);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [showSaveToLocal, setShowSaveToLocal] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const validTabs: string[] = tabs.map((t) => t.id);
    if (tab && validTabs.includes(tab)) {
      setActiveTabState(tab);
    } else if (!tab) {
      setActiveTabState('overview');
    }
  }, [id]);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'overview') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', tab);
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Build userId -> displayName map from members
  const memberMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      map[m.userId] = m.displayName || m.email;
    }
    return map;
  }, [members]);

  const getMemberName = (userId: string) => memberMap[userId] || 'Unknown User';

  const userRole = useMemo(() => {
    if (!project) return 'member' as const;
    // Check from project.role first, then from members
    if (project.role) return project.role;
    const me = members.find((m) => m.userId === currentUserId);
    return me?.role ?? 'member' as const;
  }, [project, members, currentUserId]);

  const isAdmin = userRole === 'admin';

  const handleDelete = async () => {
    if (!project) return;
    setDeleting(true);
    try {
      await removeProject();
      toast.success(`Deleted "${project.name}"`);
      router.push('/global-projects');
    } catch {
      toast.error('Failed to delete project');
      setDeleting(false);
    }
  };

  const handleLeave = async () => {
    try {
      await leaveProject();
      router.push('/global-projects');
    } catch {
      toast.error('Failed to leave project');
    }
  };

  if (loading) {
    return (
      <>
        <TopBar title="Loading..." />
        <div className="flex items-center justify-center p-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <TopBar title="Project Not Found" />
        <EmptyState
          icon={Network}
          title="Project Not Found"
          description="This project may have been deleted, or you don't have access."
          action={<Button onClick={() => router.push('/global-projects')} variant="outline">Back to Global Projects</Button>}
        />
      </>
    );
  }

  return (
    <>
      <TopBar>
        <Button variant="ghost" size="sm" onClick={() => router.push('/global-projects')} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Global Projects</span>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold sm:text-base">{project.name}</h1>
          <p className="hidden sm:block truncate text-xs text-muted-foreground">
            {project.jobSiteName}
            {activeTab !== 'overview' && (
              <span className="text-primary"> &rsaquo; {tabs.find((t) => t.id === activeTab)?.label}</span>
            )}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <ProjectStatusBadge status={project.status} />
        </div>
      </TopBar>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
        {/* Tab Navigation */}
        <div className="border-b lg:border-b-0 lg:border-r border-border lg:w-48 shrink-0">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible p-2 gap-0.5 scrollbar-thin">
            {tabs.map(({ id: tabId, label, icon: Icon }) => {
              const count = tabId === 'notes' ? notes.length
                : tabId === 'devices' ? devices.length
                : tabId === 'ip-plan' ? ipEntries.length
                : tabId === 'documents' ? files.length
                : tabId === 'reports' ? reports.length
                : tabId === 'members' ? members.length
                : tabId === 'activity' ? activity.length
                : 0;
              return (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeTab === tabId
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center text-[10px]">
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 p-4 md:p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              project={project}
              memberCount={members.length}
              noteCount={notes.length}
              deviceCount={devices.length}
              ipEntryCount={ipEntries.length}
              reportCount={reports.length}
              isAdmin={isAdmin}
              onNavigate={setActiveTab}
              onDelete={() => setShowDeleteConfirm(true)}
              onEditProject={() => setEditingProject(true)}
              onSaveToLocal={() => setShowSaveToLocal(true)}
              getMemberName={getMemberName}
            />
          )}

          {activeTab === 'notes' && (
            <NotesTab
              notes={notes}
              getMemberName={getMemberName}
              onAdd={addNote}
              onUpdate={updateNote}
              onRemove={removeNote}
            />
          )}

          {activeTab === 'devices' && (
            <DevicesTab
              devices={devices}
              getMemberName={getMemberName}
              onAdd={addDevice}
              onUpdate={updateDevice}
              onRemove={removeDevice}
            />
          )}

          {activeTab === 'ip-plan' && (
            <IpPlanTab
              entries={ipEntries}
              getMemberName={getMemberName}
              onAdd={addIpEntry}
              onUpdate={updateIpEntry}
              onRemove={removeIpEntry}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab
              files={files}
              getMemberName={getMemberName}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onAdd={addFile}
              onUpdate={updateFile}
              onRemove={removeFile}
              projectId={id}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsTab
              reports={reports}
              getMemberName={getMemberName}
              currentUserId={currentUserId}
              onUpdate={updateReport}
              onRemove={removeReport}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityTab activity={activity} getMemberName={getMemberName} />
          )}

          {activeTab === 'members' && (
            <MemberManagement
              projectId={id}
              members={members}
              currentUserId={currentUserId}
              userRole={userRole}
              onRemove={removeMember}
              onPromote={promoteMember}
              onRegenerate={async () => {
                return await regenerateCode();
              }}
              onLeave={handleLeave}
              accessCode={project.accessCode}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Global Project"
        description={`Permanently delete "${project.name}"? All data including notes, devices, and IP plan entries will be removed for all members. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete Project'}
        variant="destructive"
        onConfirm={handleDelete}
      />

      <EditProjectDialog
        project={editingProject ? project : null}
        onOpenChange={(open) => { if (!open) setEditingProject(false); }}
        onSubmit={async (data) => {
          await updateProject(data);
          toast.success('Project updated');
          setEditingProject(false);
        }}
      />

      <SaveToLocalDialog
        open={showSaveToLocal}
        onOpenChange={setShowSaveToLocal}
        project={project}
        notes={notes}
        devices={devices}
        ipEntries={ipEntries}
        reports={reports}
        onSaved={(localProjectId) => {
          setShowSaveToLocal(false);
          navigateToProject(router, localProjectId);
        }}
      />
    </>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({
  project, memberCount, noteCount, deviceCount, ipEntryCount, reportCount,
  isAdmin, onNavigate, onDelete, onEditProject, onSaveToLocal, getMemberName,
}: {
  project: NonNullable<ReturnType<typeof useGlobalProject>['project']>;
  memberCount: number;
  noteCount: number;
  deviceCount: number;
  ipEntryCount: number;
  reportCount: number;
  isAdmin: boolean;
  onNavigate: (tab: string) => void;
  onDelete: () => void;
  onEditProject: () => void;
  onSaveToLocal: () => void;
  getMemberName: (id: string) => string;
}) {
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await copyToClipboard(project.accessCode);
      setCodeCopied(true);
      toast.success('Access code copied');
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate('notes')}>
          <StickyNote className="h-3.5 w-3.5" /> Add Note
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate('devices')}>
          <Server className="h-3.5 w-3.5" /> Add Device
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate('ip-plan')}>
          <Network className="h-3.5 w-3.5" /> Add IP Entry
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate('members')}>
          <Users className="h-3.5 w-3.5" /> Members
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5" onClick={onSaveToLocal}>
          <FolderKanban className="h-3.5 w-3.5" /> Save to My Projects
        </Button>
        {isAdmin && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onEditProject}>
            <Pencil className="h-3.5 w-3.5" /> Edit Project
          </Button>
        )}
        {isAdmin && (
          <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>

      {/* Project Info + Access Code */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow icon={Hash} label="Project #" value={project.projectNumber} />
            <InfoRow icon={Building2} label="Job Site" value={project.jobSiteName} />
            <InfoRow icon={MapPin} label="Address" value={project.siteAddress} />
            <InfoRow icon={LayoutGrid} label="Building/Area" value={project.buildingArea} />
            <InfoRow icon={User} label="Created By" value={getMemberName(project.createdBy)} />
            <InfoRow icon={Clock} label="Created" value={format(new Date(project.createdAt), 'MMM d, yyyy')} />
            <InfoRow icon={Clock} label="Last Updated" value={format(new Date(project.updatedAt), 'MMM d, yyyy h:mm a')} />
            {project.description && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{project.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Access Code</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Share this code with team members to join the project.
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-muted px-4 py-2 text-lg font-mono font-bold tracking-widest">
                  {project.accessCode}
                </code>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyCode}>
                  {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {codeCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { key: 'members', label: 'Members', count: memberCount, icon: Users, color: 'text-primary' },
          { key: 'notes', label: 'Notes', count: noteCount, icon: StickyNote, color: 'text-field-warning' },
          { key: 'devices', label: 'Devices', count: deviceCount, icon: Server, color: 'text-field-info' },
          { key: 'ip-plan', label: 'IP Plan', count: ipEntryCount, icon: Network, color: 'text-field-success' },
          { key: 'reports', label: 'Reports', count: reportCount, icon: FileText, color: 'text-field-danger' },
        ].map(({ key, label, count, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:shadow-sm hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className={cn('h-5 w-5 shrink-0', color)} />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{label}</p>
              <p className="text-lg font-bold">{count}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Project Dialog ─────────────────────────────────────────────────────

function EditProjectDialog({ project, onOpenChange, onSubmit }: {
  project: GlobalProject | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Partial<GlobalProject>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', jobSiteName: '', siteAddress: '', buildingArea: '',
    projectNumber: '', description: '', status: 'active' as string, tags: '',
  });

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        jobSiteName: project.jobSiteName || '',
        siteAddress: project.siteAddress || '',
        buildingArea: project.buildingArea || '',
        projectNumber: project.projectNumber || '',
        description: project.description || '',
        status: project.status || 'active',
        tags: (project.tags ?? []).join(', '),
      });
    }
  }, [project]);

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        jobSiteName: form.jobSiteName.trim(),
        siteAddress: form.siteAddress.trim(),
        buildingArea: form.buildingArea.trim(),
        projectNumber: form.projectNumber.trim(),
        description: form.description.trim(),
        status: form.status as GlobalProjectStatus,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
    } catch {
      toast.error('Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project details and metadata.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-proj-name">Project Name *</Label>
                <Input id="edit-proj-name" value={form.name} onChange={(e) => updateField('name', e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-proj-site">Job Site Name</Label>
                <Input id="edit-proj-site" value={form.jobSiteName} onChange={(e) => updateField('jobSiteName', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-proj-address">Site Address</Label>
                <Input id="edit-proj-address" value={form.siteAddress} onChange={(e) => updateField('siteAddress', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-proj-area">Building / Area</Label>
                <Input id="edit-proj-area" value={form.buildingArea} onChange={(e) => updateField('buildingArea', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-proj-number">Project Number</Label>
                <Input id="edit-proj-number" value={form.projectNumber} onChange={(e) => updateField('projectNumber', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-proj-status">Status</Label>
                <select
                  id="edit-proj-status"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="active">Active</option>
                  <option value="on-hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-proj-tags">Tags (comma-separated)</Label>
                <Input id="edit-proj-tags" value={form.tags} onChange={(e) => updateField('tags', e.target.value)} placeholder="hvac, phase-1, priority" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-proj-desc">Description</Label>
                <Textarea id="edit-proj-desc" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="px-5 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Hash; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

// ─── Notes Tab ───────────────────────────────────────────────────────────────

function NotesTab({
  notes, getMemberName, onAdd, onUpdate, onRemove,
}: {
  notes: GlobalFieldNote[];
  getMemberName: (id: string) => string;
  onAdd: (data: Omit<GlobalFieldNote, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<GlobalFieldNote>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GlobalFieldNote | null>(null);

  const handleAdd = async (content: string, category: string) => {
    try {
      await onAdd({
        content,
        category: category as GlobalFieldNote['category'],
        isPinned: false,
        tags: [],
        fileId: null,
        updatedBy: null,
        deletedAt: null,
      });
      setShowAdd(false);
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await onUpdate(id, { content: editContent });
      setEditingId(null);
      toast.success('Note updated');
    } catch {
      toast.error('Failed to update note');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <StickyNote className="h-5 w-5" /> Field Notes
        </h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Note
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No Notes Yet"
          description="Add field notes to share observations with your team."
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Add Note
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="p-4">
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleSaveEdit(note.id)}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px]">{note.category}</Badge>
                          {note.isPinned && <Badge variant="secondary" className="text-[10px]">Pinned</Badge>}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                          className="rounded p-1.5 hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(note)}
                          className="rounded p-1.5 hover:bg-muted"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Added by {getMemberName(note.createdBy)} &middot; {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                      {note.updatedBy && note.updatedAt !== note.createdAt && (
                        <span className="text-primary/70"> &middot; Edited by {getMemberName(note.updatedBy)} {format(new Date(note.updatedAt), 'MMM d h:mm a')}</span>
                      )}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddNoteDialog open={showAdd} onOpenChange={setShowAdd} onSubmit={handleAdd} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Note"
        description="Are you sure you want to delete this note? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function AddNoteDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (content: string, category: string) => Promise<void> }) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSubmit(content.trim(), category);
      setContent('');
      setCategory('general');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Field Note</DialogTitle>
          <DialogDescription>Add a note visible to all project members.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note-category">Category</Label>
              <select
                id="note-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="general">General</option>
                <option value="issue">Issue</option>
                <option value="fix">Fix</option>
                <option value="punch-item">Punch Item</option>
                <option value="startup-note">Startup Note</option>
                <option value="network-change">Network Change</option>
                <option value="customer-request">Customer Request</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                placeholder="Enter your note..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                required
                autoFocus
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !content.trim()}>
              {saving ? 'Adding...' : 'Add Note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Devices Tab ─────────────────────────────────────────────────────────────

function DevicesTab({
  devices, getMemberName, onAdd, onUpdate, onRemove,
}: {
  devices: GlobalDevice[];
  getMemberName: (id: string) => string;
  onAdd: (data: Omit<GlobalDevice, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<GlobalDevice>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<GlobalDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalDevice | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Device deleted');
    } catch {
      toast.error('Failed to delete device');
    }
  };

  const statusColors: Record<string, string> = {
    'Online': 'bg-field-success/10 text-field-success',
    'Offline': 'bg-muted text-muted-foreground',
    'Issue': 'bg-field-danger/10 text-field-danger',
    'Not Commissioned': 'bg-field-warning/10 text-field-warning',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Server className="h-5 w-5" /> Devices
        </h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Device
        </Button>
      </div>

      {devices.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No Devices Yet"
          description="Add BAS controllers and devices to track in this project."
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Add Device
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <Card key={device.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold truncate">{device.deviceName}</h3>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', statusColors[device.status] || 'bg-muted text-muted-foreground')}>
                        {device.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {device.controllerType && <span>Type: {device.controllerType}</span>}
                      {device.ipAddress && <span>IP: {device.ipAddress}</span>}
                      {device.panel && <span>Panel: {device.panel}</span>}
                      {device.system && <span>System: {device.system}</span>}
                      {device.floor && <span>Floor: {device.floor}</span>}
                      {device.area && <span>Area: {device.area}</span>}
                    </div>
                    {device.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{device.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => setEditTarget(device)}
                      className="rounded p-1.5 hover:bg-muted"
                      title="Edit"
                    >
                      <Edit2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(device)}
                      className="rounded p-1.5 hover:bg-muted"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Added by {getMemberName(device.createdBy)} &middot; {format(new Date(device.createdAt), 'MMM d, yyyy')}
                  {device.updatedBy && device.updatedAt !== device.createdAt && (
                    <span className="text-primary/70"> &middot; Edited by {getMemberName(device.updatedBy)} {format(new Date(device.updatedAt), 'MMM d h:mm a')}</span>
                  )}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddDeviceDialog open={showAdd} onOpenChange={setShowAdd} onSubmit={onAdd} />

      <EditDeviceDialog
        device={editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onSubmit={async (data) => {
          if (!editTarget) return;
          await onUpdate(editTarget.id, data);
          setEditTarget(null);
          toast.success('Device updated');
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Device"
        description={deleteTarget ? `Delete "${deleteTarget.deviceName}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function AddDeviceDialog({ open, onOpenChange, onSubmit }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Omit<GlobalDevice, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    deviceName: '', description: '', system: '', panel: '',
    controllerType: '', ipAddress: '', floor: '', area: '', notes: '',
  });

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deviceName.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        deviceName: form.deviceName.trim(),
        description: form.description.trim(),
        system: form.system.trim(),
        panel: form.panel.trim(),
        controllerType: form.controllerType.trim(),
        macAddress: null,
        instanceNumber: null,
        ipAddress: form.ipAddress.trim() || null,
        floor: form.floor.trim(),
        area: form.area.trim(),
        status: 'Not Commissioned',
        notes: form.notes.trim(),
        updatedBy: null,
        deletedAt: null,
      });
      setForm({ deviceName: '', description: '', system: '', panel: '', controllerType: '', ipAddress: '', floor: '', area: '', notes: '' });
      onOpenChange(false);
      toast.success('Device added');
    } catch {
      toast.error('Failed to add device');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Device</DialogTitle>
          <DialogDescription>Add a BAS controller or device to the project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="dev-name">Device Name *</Label>
                <Input id="dev-name" placeholder="e.g. PXC36-AHU1" value={form.deviceName} onChange={(e) => updateField('deviceName', e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-type">Controller Type</Label>
                <Input id="dev-type" placeholder="e.g. PXC36.D" value={form.controllerType} onChange={(e) => updateField('controllerType', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-ip">IP Address</Label>
                <Input id="dev-ip" placeholder="e.g. 192.168.1.100" value={form.ipAddress} onChange={(e) => updateField('ipAddress', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-panel">Panel</Label>
                <Input id="dev-panel" placeholder="e.g. MEC-1" value={form.panel} onChange={(e) => updateField('panel', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-system">System</Label>
                <Input id="dev-system" placeholder="e.g. HVAC" value={form.system} onChange={(e) => updateField('system', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-floor">Floor</Label>
                <Input id="dev-floor" placeholder="e.g. 2nd Floor" value={form.floor} onChange={(e) => updateField('floor', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-area">Area</Label>
                <Input id="dev-area" placeholder="e.g. Mech Room 104" value={form.area} onChange={(e) => updateField('area', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="dev-desc">Description</Label>
                <Textarea id="dev-desc" placeholder="Brief description..." value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.deviceName.trim()}>
              {saving ? 'Adding...' : 'Add Device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDeviceDialog({ device, onOpenChange, onSubmit }: {
  device: GlobalDevice | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Partial<GlobalDevice>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    deviceName: '', description: '', system: '', panel: '',
    controllerType: '', ipAddress: '', floor: '', area: '', notes: '', status: '',
  });

  useEffect(() => {
    if (device) {
      setForm({
        deviceName: device.deviceName || '',
        description: device.description || '',
        system: device.system || '',
        panel: device.panel || '',
        controllerType: device.controllerType || '',
        ipAddress: device.ipAddress || '',
        floor: device.floor || '',
        area: device.area || '',
        notes: device.notes || '',
        status: device.status || 'Not Commissioned',
      });
    }
  }, [device]);

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deviceName.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        deviceName: form.deviceName.trim(),
        description: form.description.trim(),
        system: form.system.trim(),
        panel: form.panel.trim(),
        controllerType: form.controllerType.trim(),
        ipAddress: form.ipAddress.trim() || null,
        floor: form.floor.trim(),
        area: form.area.trim(),
        status: form.status as GlobalDeviceStatus,
        notes: form.notes.trim(),
      });
    } catch {
      toast.error('Failed to update device');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={device !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Device</DialogTitle>
          <DialogDescription>Update device details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-dev-name">Device Name *</Label>
                <Input id="edit-dev-name" value={form.deviceName} onChange={(e) => updateField('deviceName', e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dev-type">Controller Type</Label>
                <Input id="edit-dev-type" value={form.controllerType} onChange={(e) => updateField('controllerType', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dev-ip">IP Address</Label>
                <Input id="edit-dev-ip" value={form.ipAddress} onChange={(e) => updateField('ipAddress', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dev-panel">Panel</Label>
                <Input id="edit-dev-panel" value={form.panel} onChange={(e) => updateField('panel', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dev-system">System</Label>
                <Input id="edit-dev-system" value={form.system} onChange={(e) => updateField('system', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dev-floor">Floor</Label>
                <Input id="edit-dev-floor" value={form.floor} onChange={(e) => updateField('floor', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dev-area">Area</Label>
                <Input id="edit-dev-area" value={form.area} onChange={(e) => updateField('area', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dev-status">Status</Label>
                <select
                  id="edit-dev-status"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="Not Commissioned">Not Commissioned</option>
                  <option value="Online">Online</option>
                  <option value="Offline">Offline</option>
                  <option value="Issue">Issue</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-dev-desc">Description</Label>
                <Textarea id="edit-dev-desc" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.deviceName.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── IP Plan Tab ─────────────────────────────────────────────────────────────

function IpPlanTab({
  entries, getMemberName, onAdd, onUpdate, onRemove,
}: {
  entries: GlobalIpPlanEntry[];
  getMemberName: (id: string) => string;
  onAdd: (data: Omit<GlobalIpPlanEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<GlobalIpPlanEntry>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<GlobalIpPlanEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalIpPlanEntry | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('IP entry deleted');
    } catch {
      toast.error('Failed to delete entry');
    }
  };

  const statusColors: Record<string, string> = {
    active: 'bg-field-success/10 text-field-success',
    reserved: 'bg-field-warning/10 text-field-warning',
    available: 'bg-field-info/10 text-field-info',
    conflict: 'bg-field-danger/10 text-field-danger',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Network className="h-5 w-5" /> IP Plan
        </h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Entry
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No IP Entries Yet"
          description="Add IP address assignments to build the project network plan."
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Add Entry
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-3 text-xs font-medium text-muted-foreground">IP Address</th>
                <th className="pb-2 pr-3 text-xs font-medium text-muted-foreground">Hostname</th>
                <th className="pb-2 pr-3 text-xs font-medium text-muted-foreground">Panel</th>
                <th className="pb-2 pr-3 text-xs font-medium text-muted-foreground">VLAN</th>
                <th className="pb-2 pr-3 text-xs font-medium text-muted-foreground">Subnet</th>
                <th className="pb-2 pr-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="pb-2 pr-3 text-xs font-medium text-muted-foreground">Added By</th>
                <th className="pb-2 text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-3 font-mono text-xs">{entry.ipAddress}</td>
                  <td className="py-2 pr-3 text-xs">{entry.hostname}</td>
                  <td className="py-2 pr-3 text-xs">{entry.panel}</td>
                  <td className="py-2 pr-3 text-xs">{entry.vlan}</td>
                  <td className="py-2 pr-3 text-xs font-mono">{entry.subnet}</td>
                  <td className="py-2 pr-3">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', statusColors[entry.status] || 'bg-muted text-muted-foreground')}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {getMemberName(entry.createdBy)}
                    {entry.updatedBy && entry.updatedAt !== entry.createdAt && (
                      <span className="block text-[10px] text-primary/70">edited by {getMemberName(entry.updatedBy)}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => setEditTarget(entry)}
                        className="rounded p-1 hover:bg-muted"
                        title="Edit"
                      >
                        <Edit2 className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(entry)}
                        className="rounded p-1 hover:bg-muted"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddIpEntryDialog open={showAdd} onOpenChange={setShowAdd} onSubmit={onAdd} />

      <EditIpEntryDialog
        entry={editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onSubmit={async (data) => {
          if (!editTarget) return;
          await onUpdate(editTarget.id, data);
          setEditTarget(null);
          toast.success('IP entry updated');
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete IP Entry"
        description={deleteTarget ? `Delete IP entry "${deleteTarget.ipAddress}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function AddIpEntryDialog({ open, onOpenChange, onSubmit }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Omit<GlobalIpPlanEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ipAddress: '', hostname: '', panel: '', vlan: '',
    subnet: '', deviceRole: '', notes: '',
  });

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ipAddress.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        ipAddress: form.ipAddress.trim(),
        hostname: form.hostname.trim(),
        panel: form.panel.trim(),
        vlan: form.vlan.trim(),
        subnet: form.subnet.trim(),
        deviceRole: form.deviceRole.trim(),
        macAddress: null,
        notes: form.notes.trim(),
        status: 'active',
        updatedBy: null,
        deletedAt: null,
      });
      setForm({ ipAddress: '', hostname: '', panel: '', vlan: '', subnet: '', deviceRole: '', notes: '' });
      onOpenChange(false);
      toast.success('IP entry added');
    } catch {
      toast.error('Failed to add IP entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add IP Entry</DialogTitle>
          <DialogDescription>Add an IP address assignment to the network plan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ip-addr">IP Address *</Label>
                <Input id="ip-addr" placeholder="e.g. 192.168.1.100" value={form.ipAddress} onChange={(e) => updateField('ipAddress', e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip-host">Hostname</Label>
                <Input id="ip-host" placeholder="e.g. PXC36-AHU1" value={form.hostname} onChange={(e) => updateField('hostname', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip-panel">Panel</Label>
                <Input id="ip-panel" placeholder="e.g. MEC-1" value={form.panel} onChange={(e) => updateField('panel', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip-role">Device Role</Label>
                <Input id="ip-role" placeholder="e.g. BACnet Controller" value={form.deviceRole} onChange={(e) => updateField('deviceRole', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip-vlan">VLAN</Label>
                <Input id="ip-vlan" placeholder="e.g. 100" value={form.vlan} onChange={(e) => updateField('vlan', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip-subnet">Subnet</Label>
                <Input id="ip-subnet" placeholder="e.g. 255.255.255.0" value={form.subnet} onChange={(e) => updateField('subnet', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ip-notes">Notes</Label>
                <Textarea id="ip-notes" placeholder="Any notes about this IP assignment..." value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.ipAddress.trim()}>
              {saving ? 'Adding...' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditIpEntryDialog({ entry, onOpenChange, onSubmit }: {
  entry: GlobalIpPlanEntry | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Partial<GlobalIpPlanEntry>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ipAddress: '', hostname: '', panel: '', vlan: '',
    subnet: '', deviceRole: '', notes: '', status: 'active',
  });

  useEffect(() => {
    if (entry) {
      setForm({
        ipAddress: entry.ipAddress || '',
        hostname: entry.hostname || '',
        panel: entry.panel || '',
        vlan: entry.vlan || '',
        subnet: entry.subnet || '',
        deviceRole: entry.deviceRole || '',
        notes: entry.notes || '',
        status: entry.status || 'active',
      });
    }
  }, [entry]);

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ipAddress.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        ipAddress: form.ipAddress.trim(),
        hostname: form.hostname.trim(),
        panel: form.panel.trim(),
        vlan: form.vlan.trim(),
        subnet: form.subnet.trim(),
        deviceRole: form.deviceRole.trim(),
        notes: form.notes.trim(),
        status: form.status as GlobalIpPlanEntry['status'],
      });
    } catch {
      toast.error('Failed to update IP entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit IP Entry</DialogTitle>
          <DialogDescription>Update IP address assignment details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-ip-addr">IP Address *</Label>
                <Input id="edit-ip-addr" value={form.ipAddress} onChange={(e) => updateField('ipAddress', e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip-host">Hostname</Label>
                <Input id="edit-ip-host" value={form.hostname} onChange={(e) => updateField('hostname', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip-panel">Panel</Label>
                <Input id="edit-ip-panel" value={form.panel} onChange={(e) => updateField('panel', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip-role">Device Role</Label>
                <Input id="edit-ip-role" value={form.deviceRole} onChange={(e) => updateField('deviceRole', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip-vlan">VLAN</Label>
                <Input id="edit-ip-vlan" value={form.vlan} onChange={(e) => updateField('vlan', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip-subnet">Subnet</Label>
                <Input id="edit-ip-subnet" value={form.subnet} onChange={(e) => updateField('subnet', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip-status">Status</Label>
                <select
                  id="edit-ip-status"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="active">Active</option>
                  <option value="reserved">Reserved</option>
                  <option value="available">Available</option>
                  <option value="conflict">Conflict</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-ip-notes">Notes</Label>
                <Textarea id="edit-ip-notes" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.ipAddress.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Documents Tab ──────────────────────────────────────────────────────────

const DOCUMENT_CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'panel-databases', label: 'Panel Databases' },
  { value: 'wiring-diagrams', label: 'Wiring Diagrams' },
  { value: 'sequences', label: 'Sequences' },
  { value: 'backups', label: 'Backups' },
  { value: 'general-documents', label: 'General Documents' },
  { value: 'photos', label: 'Photos' },
  { value: 'other', label: 'Other' },
] as const;

const DOCUMENT_STATUSES = [
  { value: 'current', label: 'Current' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'archived', label: 'Archived' },
] as const;

function DocumentsTab({
  files, getMemberName, currentUserId, isAdmin, onAdd, onUpdate, onRemove, projectId,
}: {
  files: GlobalProjectFile[];
  getMemberName: (id: string) => string;
  currentUserId: string;
  isAdmin: boolean;
  onAdd: (data: Omit<GlobalProjectFile, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<GlobalProjectFile>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  projectId: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<GlobalProjectFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalProjectFile | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredFiles = useMemo(() => {
    if (categoryFilter === 'all') return files;
    return files.filter((f) => f.category === categoryFilter);
  }, [files, categoryFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const statusColors: Record<string, string> = {
    current: 'bg-field-success/10 text-field-success',
    superseded: 'bg-field-warning/10 text-field-warning',
    archived: 'bg-muted text-muted-foreground',
  };

  const canEdit = (file: GlobalProjectFile) => isAdmin || file.createdBy === currentUserId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderOpen className="h-5 w-5" /> Documents
        </h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Document
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2">
        <Label htmlFor="doc-category-filter" className="text-xs text-muted-foreground whitespace-nowrap">Filter:</Label>
        <select
          id="doc-category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {DOCUMENT_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
      </div>

      {filteredFiles.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No Documents Yet"
          description={categoryFilter !== 'all' ? 'No documents match the selected category.' : 'Add project documents like panel databases, wiring diagrams, and sequences.'}
          action={
            categoryFilter === 'all' ? (
              <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" /> Add Document
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredFiles.map((file) => {
            const fileUrl = file.storagePath ? getPublicUrl(file.storagePath) : null;
            const isImg = isImageFile(file.mimeType);
            return (
              <Card key={file.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Thumbnail for images */}
                    {isImg && fileUrl && (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <img
                          src={fileUrl}
                          alt={file.title}
                          className="h-16 w-16 rounded-md object-cover border border-border hover:ring-2 hover:ring-primary/40 transition-all"
                        />
                      </a>
                    )}
                    {!isImg && fileUrl && (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted border border-border">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold truncate">{file.title}</h3>
                        <Badge variant="secondary" className="text-[10px]">{file.category}</Badge>
                        {file.size > 0 && (
                          <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {file.fileName && <span className="truncate">File: {file.fileName}</span>}
                        {file.panelSystem && <span>Panel/System: {file.panelSystem}</span>}
                        {file.revisionNumber && <span>Rev: {file.revisionNumber}</span>}
                        {file.revisionDate && <span>Rev Date: {file.revisionDate}</span>}
                      </div>
                      {file.notes && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{file.notes}</p>
                      )}
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Uploaded by {getMemberName(file.createdBy)} &middot; {format(new Date(file.createdAt), 'MMM d, yyyy')}
                        {file.updatedBy && file.updatedAt !== file.createdAt && (
                          <span className="text-primary/70"> &middot; Edited {format(new Date(file.updatedAt), 'MMM d h:mm a')}</span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {fileUrl && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1.5 hover:bg-muted"
                          title="Open / Download"
                        >
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                      {canEdit(file) && (
                        <>
                          <button
                            onClick={() => setEditTarget(file)}
                            className="rounded p-1.5 hover:bg-muted"
                            title="Edit"
                          >
                            <Edit2 className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(file)}
                            className="rounded p-1.5 hover:bg-muted"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddDocumentDialog open={showAdd} onOpenChange={setShowAdd} onSubmit={onAdd} projectId={projectId} />

      <EditDocumentDialog
        file={editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onSubmit={async (data) => {
          if (!editTarget) return;
          await onUpdate(editTarget.id, data);
          setEditTarget(null);
          toast.success('Document updated');
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Document"
        description={deleteTarget ? `Delete "${deleteTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function FilePreviewImage({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="Preview" className="mx-auto mb-2 max-h-24 rounded-md object-contain" />;
}

function AddDocumentDialog({ open, onOpenChange, onSubmit, projectId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Omit<GlobalProjectFile, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
  projectId: string;
}) {
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: '',
    category: 'general-documents',
    panelSystem: '',
    notes: '',
  });

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return;
    const sizeError = validateFileSize(selected);
    if (sizeError) { toast.error(sizeError); return; }
    setFile(selected);
    if (!form.title) {
      setForm(f => ({ ...f, title: selected.name.replace(/\.[^.]+$/, '') }));
    }
    // Auto-detect category for images
    if (isImageFile(selected.type)) {
      setForm(f => ({ ...f, category: 'photos' }));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const resetForm = () => {
    setFile(null);
    setForm({ title: '', category: 'general-documents', panelSystem: '', notes: '' });
    setDragOver(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      let storagePath: string | null = null;
      let fileName = '';
      let fileType = '';
      let mimeType = '';
      let size = 0;

      if (file) {
        fileName = file.name;
        fileType = file.name.split('.').pop() || '';
        mimeType = file.type || 'application/octet-stream';
        size = file.size;
        storagePath = buildStoragePath(projectId, file.name);
        await uploadProjectFile(file, storagePath);
      }

      await onSubmit({
        title: form.title.trim(),
        fileName,
        fileType,
        mimeType,
        category: form.category,
        panelSystem: form.panelSystem.trim() || null,
        revisionNumber: '',
        revisionDate: '',
        notes: form.notes.trim(),
        status: 'current',
        tags: [],
        isPinned: false,
        size,
        storagePath,
        versions: [],
        updatedBy: null,
        deletedAt: null,
      });
      resetForm();
      onOpenChange(false);
      toast.success(file ? 'File uploaded' : 'Document added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document / Photo</DialogTitle>
          <DialogDescription>
            Upload a file to this project. Photos: 5MB max. Documents: 50MB max.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            {/* Drop zone */}
            <div
              className={cn(
                'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                file && 'border-field-success/50 bg-field-success/5'
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="*"
                className="hidden"
                onChange={(e) => { handleFileSelect(e.target.files?.[0] || null); if (e.target) e.target.value = ''; }}
              />
              {file ? (
                <div className="text-center">
                  {isImageFile(file.type) && (
                    <FilePreviewImage file={file} />
                  )}
                  <p className="text-sm font-medium truncate max-w-[280px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  <button
                    type="button"
                    className="absolute top-2 right-2 rounded p-1 hover:bg-muted"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop file here or click to browse</p>
                    <p className="text-xs text-muted-foreground">Photos, PDFs, drawings, or any document</p>
                  </div>
                </>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="doc-title">Title *</Label>
                <Input id="doc-title" placeholder="e.g. AHU-1 Panel Photo" value={form.title} onChange={(e) => updateField('title', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-category">Category</Label>
                <select
                  id="doc-category"
                  value={form.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {DOCUMENT_CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-panel">Panel / System</Label>
                <Input id="doc-panel" placeholder="e.g. MEC-1" value={form.panelSystem} onChange={(e) => updateField('panelSystem', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="doc-notes">Notes</Label>
                <Textarea id="doc-notes" placeholder="Any notes about this document..." value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? 'Uploading...' : file ? 'Upload' : 'Add Record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDocumentDialog({ file, onOpenChange, onSubmit }: {
  file: GlobalProjectFile | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Partial<GlobalProjectFile>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', category: 'general-documents', panelSystem: '',
    revisionNumber: '', revisionDate: '', notes: '', status: 'current',
  });

  useEffect(() => {
    if (file) {
      setForm({
        title: file.title || '',
        category: file.category || 'general-documents',
        panelSystem: file.panelSystem || '',
        revisionNumber: file.revisionNumber || '',
        revisionDate: file.revisionDate || '',
        notes: file.notes || '',
        status: file.status || 'current',
      });
    }
  }, [file]);

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        category: form.category,
        panelSystem: form.panelSystem.trim() || null,
        revisionNumber: form.revisionNumber.trim(),
        revisionDate: form.revisionDate.trim(),
        notes: form.notes.trim(),
        status: form.status,
      });
    } catch {
      toast.error('Failed to update document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
          <DialogDescription>Update document details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-doc-title">Title *</Label>
                <Input id="edit-doc-title" value={form.title} onChange={(e) => updateField('title', e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-doc-category">Category</Label>
                <select
                  id="edit-doc-category"
                  value={form.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {DOCUMENT_CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-doc-panel">Panel / System</Label>
                <Input id="edit-doc-panel" value={form.panelSystem} onChange={(e) => updateField('panelSystem', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-doc-revnum">Revision Number</Label>
                <Input id="edit-doc-revnum" value={form.revisionNumber} onChange={(e) => updateField('revisionNumber', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-doc-revdate">Revision Date</Label>
                <Input id="edit-doc-revdate" type="date" value={form.revisionDate} onChange={(e) => updateField('revisionDate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-doc-status">Status</Label>
                <select
                  id="edit-doc-status"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {DOCUMENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-doc-notes">Notes</Label>
                <Textarea id="edit-doc-notes" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reports Tab ─────────────────────────────────────────────────────────────

function ReportsTab({ reports, getMemberName, currentUserId, onUpdate, onRemove }: {
  reports: GlobalDailyReport[];
  getMemberName: (id: string) => string;
  currentUserId: string;
  onUpdate: (id: string, data: Partial<GlobalDailyReport>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<GlobalDailyReport | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalDailyReport | null>(null);

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-field-info/10 text-field-info',
    finalized: 'bg-field-success/10 text-field-success',
  };

  const sorted = useMemo(
    () => [...reports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [reports],
  );

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleEditSubmit = async (id: string, data: Partial<GlobalDailyReport>) => {
    try {
      await onUpdate(id, data);
      setEditTarget(null);
      toast.success('Report updated');
    } catch {
      toast.error('Failed to update report');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Report deleted');
    } catch {
      toast.error('Failed to delete report');
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5" /> Daily Reports
      </h2>

      {sorted.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Reports Yet"
          description="No daily reports have been linked to this project yet."
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((report) => {
            const isExpanded = expandedIds.has(report.id);
            const isOwner = report.createdBy === currentUserId;
            const hasDetails =
              report.workCompleted || report.issuesEncountered || report.workPlannedNext ||
              report.coordinationNotes || report.equipmentWorkedOn || report.safetyNotes ||
              report.generalNotes || report.deviceIpChanges;

            return (
              <Card key={report.id}>
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold">
                          Report #{report.reportNumber} &mdash; {format(new Date(report.date), 'MMM d, yyyy')}
                        </h3>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                            statusColors[report.status] || 'bg-muted text-muted-foreground',
                          )}
                        >
                          {report.status}
                        </span>
                      </div>

                      {/* Meta grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" /> {report.technicianName}
                        </span>
                        {report.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" /> {report.location}
                          </span>
                        )}
                        {report.hoursOnSite && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" /> {report.hoursOnSite} hrs on site
                          </span>
                        )}
                        {(report.startTime || report.endTime) && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" /> {report.startTime} &ndash; {report.endTime}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isOwner && (
                        <>
                          <button
                            onClick={() => setEditTarget(report)}
                            className="p-1 rounded-md hover:bg-muted transition-colors"
                            aria-label="Edit report"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(report)}
                            className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
                            aria-label="Delete report"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                      {hasDetails && (
                        <button
                          onClick={() => toggle(report.id)}
                          className="p-1 rounded-md hover:bg-muted transition-colors"
                          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                        >
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable detail section */}
                  {isExpanded && hasDetails && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <ReportDetailRow label="Work Completed" value={report.workCompleted} />
                      <ReportDetailRow label="Issues Encountered" value={report.issuesEncountered} />
                      <ReportDetailRow label="Work Planned Next" value={report.workPlannedNext} />
                      <ReportDetailRow label="Coordination Notes" value={report.coordinationNotes} />
                      <ReportDetailRow label="Equipment Worked On" value={report.equipmentWorkedOn} />
                      <ReportDetailRow label="Device / IP Changes" value={report.deviceIpChanges} />
                      <ReportDetailRow label="Safety Notes" value={report.safetyNotes} />
                      <ReportDetailRow label="General Notes" value={report.generalNotes} />
                      {report.weather && (
                        <p className="text-xs text-muted-foreground">
                          <strong className="text-foreground">Weather:</strong> {report.weather}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Posted by {getMemberName(report.createdBy)} &middot; {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
                    {report.updatedBy && report.updatedAt !== report.createdAt && (
                      <> &middot; Edited by {getMemberName(report.updatedBy)} {format(new Date(report.updatedAt), 'MMM d h:mm a')}</>
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EditReportDialog
        report={editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
        onSubmit={handleEditSubmit}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Delete Report"
        description={deleteTarget ? `Delete Report #${deleteTarget.reportNumber} from ${format(new Date(deleteTarget.date), 'MMM d, yyyy')}? This cannot be undone.` : ''}
        confirmLabel="Delete Report"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─── Edit Report Dialog ──────────────────────────────────────────────────────

function EditReportDialog({ report, onOpenChange, onSubmit }: {
  report: GlobalDailyReport | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (id: string, data: Partial<GlobalDailyReport>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: '', technicianName: '', status: 'draft',
    startTime: '', endTime: '', hoursOnSite: '', location: '', weather: '',
    workCompleted: '', issuesEncountered: '', workPlannedNext: '',
    equipmentWorkedOn: '', deviceIpChanges: '',
    coordinationNotes: '', safetyNotes: '', generalNotes: '',
  });

  useEffect(() => {
    if (report) {
      setForm({
        date: report.date || '',
        technicianName: report.technicianName || '',
        status: report.status || 'draft',
        startTime: report.startTime || '',
        endTime: report.endTime || '',
        hoursOnSite: report.hoursOnSite || '',
        location: report.location || '',
        weather: report.weather || '',
        workCompleted: report.workCompleted || '',
        issuesEncountered: report.issuesEncountered || '',
        workPlannedNext: report.workPlannedNext || '',
        equipmentWorkedOn: report.equipmentWorkedOn || '',
        deviceIpChanges: report.deviceIpChanges || '',
        coordinationNotes: report.coordinationNotes || '',
        safetyNotes: report.safetyNotes || '',
        generalNotes: report.generalNotes || '',
      });
    }
  }, [report]);

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !form.technicianName.trim()) return;
    setSaving(true);
    try {
      await onSubmit(report.id, {
        date: form.date,
        technicianName: form.technicianName.trim(),
        status: form.status as GlobalDailyReport['status'],
        startTime: form.startTime.trim(),
        endTime: form.endTime.trim(),
        hoursOnSite: form.hoursOnSite.trim(),
        location: form.location.trim(),
        weather: form.weather.trim(),
        workCompleted: form.workCompleted.trim(),
        issuesEncountered: form.issuesEncountered.trim(),
        workPlannedNext: form.workPlannedNext.trim(),
        equipmentWorkedOn: form.equipmentWorkedOn.trim(),
        deviceIpChanges: form.deviceIpChanges.trim(),
        coordinationNotes: form.coordinationNotes.trim(),
        safetyNotes: form.safetyNotes.trim(),
        generalNotes: form.generalNotes.trim(),
      });
    } catch {
      toast.error('Failed to update report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={report !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Report</DialogTitle>
          <DialogDescription>Update daily report details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-5">
            {/* Header Section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Header</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-tech">Technician Name *</Label>
                  <Input id="edit-rpt-tech" value={form.technicianName} onChange={(e) => updateField('technicianName', e.target.value)} required autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-date">Date</Label>
                  <Input id="edit-rpt-date" type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-status">Status</Label>
                  <select
                    id="edit-rpt-status"
                    value={form.status}
                    onChange={(e) => updateField('status', e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="finalized">Finalized</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Time / Location Section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time &amp; Location</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-start">Start Time</Label>
                  <Input id="edit-rpt-start" value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} placeholder="e.g. 07:00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-end">End Time</Label>
                  <Input id="edit-rpt-end" value={form.endTime} onChange={(e) => updateField('endTime', e.target.value)} placeholder="e.g. 16:00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-hours">Hours on Site</Label>
                  <Input id="edit-rpt-hours" value={form.hoursOnSite} onChange={(e) => updateField('hoursOnSite', e.target.value)} placeholder="e.g. 8" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-loc">Location</Label>
                  <Input id="edit-rpt-loc" value={form.location} onChange={(e) => updateField('location', e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-rpt-weather">Weather</Label>
                  <Input id="edit-rpt-weather" value={form.weather} onChange={(e) => updateField('weather', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Work Summary Section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Work Summary</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-work">Work Completed</Label>
                  <Textarea id="edit-rpt-work" value={form.workCompleted} onChange={(e) => updateField('workCompleted', e.target.value)} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-issues">Issues Encountered</Label>
                  <Textarea id="edit-rpt-issues" value={form.issuesEncountered} onChange={(e) => updateField('issuesEncountered', e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-next">Work Planned Next</Label>
                  <Textarea id="edit-rpt-next" value={form.workPlannedNext} onChange={(e) => updateField('workPlannedNext', e.target.value)} rows={2} />
                </div>
              </div>
            </div>

            {/* Systems Section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Systems</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-equip">Equipment Worked On</Label>
                  <Textarea id="edit-rpt-equip" value={form.equipmentWorkedOn} onChange={(e) => updateField('equipmentWorkedOn', e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-ipchanges">Device / IP Changes</Label>
                  <Textarea id="edit-rpt-ipchanges" value={form.deviceIpChanges} onChange={(e) => updateField('deviceIpChanges', e.target.value)} rows={2} />
                </div>
              </div>
            </div>

            {/* Coordination & Additional Section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Coordination &amp; Additional</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-coord">Coordination Notes</Label>
                  <Textarea id="edit-rpt-coord" value={form.coordinationNotes} onChange={(e) => updateField('coordinationNotes', e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-safety">Safety Notes</Label>
                  <Textarea id="edit-rpt-safety" value={form.safetyNotes} onChange={(e) => updateField('safetyNotes', e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rpt-general">General Notes</Label>
                  <Textarea id="edit-rpt-general" value={form.generalNotes} onChange={(e) => updateField('generalNotes', e.target.value)} rows={2} />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.technicianName.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper to render a labelled detail row only when a value exists. */
function ReportDetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <strong className="text-foreground">{label}:</strong>{' '}
      <span className="whitespace-pre-line">{value}</span>
    </div>
  );
}

// ─── Activity Tab ────────────────────────────────────────────────────────────

function ActivityTab({ activity, getMemberName }: {
  activity: GlobalActivityLogEntry[];
  getMemberName: (id: string) => string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <History className="h-5 w-5" /> Activity Log
      </h2>

      {activity.length === 0 ? (
        <EmptyState
          icon={History}
          title="No Activity Yet"
          description="Activity will be logged as team members interact with the project."
        />
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {activity.map((entry) => (
              <div key={entry.id} className="relative flex gap-4 pl-10">
                <div className="absolute left-2.5 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary/20 ring-2 ring-background">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{getMemberName(entry.userId)}</span>
                    {' '}{entry.action}
                  </p>
                  {entry.details && (
                    <div className="mt-1 rounded-md bg-muted/50 px-2.5 py-1.5 space-y-0.5">
                      {entry.details.split('\n').map((line, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          {line.includes(' → ') ? (
                            <>
                              <span className="font-medium text-foreground/70">{line.split(' → ')[0]}</span>
                              <span className="text-primary/70"> → </span>
                              <span>{line.split(' → ').slice(1).join(' → ')}</span>
                            </>
                          ) : line}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {format(new Date(entry.timestamp), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
