'use client';

import { useState, useMemo, use, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft, LayoutGrid, StickyNote, Server, Network, FileText,
  History, Users, Plus, Trash2, Edit2, MapPin, Hash, Building2,
  Copy, Check, Clock, User, ClipboardList,
} from 'lucide-react';
import {
  useGlobalProject,
  useGlobalProjectMembers,
  useGlobalProjectNotes,
  useGlobalProjectDevices,
  useGlobalProjectIpPlan,
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
import { cn, copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  GlobalFieldNote,
  GlobalDevice,
  GlobalDeviceStatus,
  GlobalIpPlanEntry,
  GlobalDailyReport,
  GlobalActivityLogEntry,
  GlobalProjectMember,
} from '@/types/global-projects';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'devices', label: 'Devices', icon: Server },
  { id: 'ip-plan', label: 'IP Plan', icon: Network },
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
  const { reports } = useGlobalProjectReports(id);
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

          {activeTab === 'reports' && (
            <ReportsTab reports={reports} getMemberName={getMemberName} />
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
    </>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({
  project, memberCount, noteCount, deviceCount, ipEntryCount, reportCount,
  isAdmin, onNavigate, onDelete, getMemberName,
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

// ─── Reports Tab ─────────────────────────────────────────────────────────────

function ReportsTab({ reports, getMemberName }: {
  reports: GlobalDailyReport[];
  getMemberName: (id: string) => string;
}) {
  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-field-info/10 text-field-info',
    finalized: 'bg-field-success/10 text-field-success',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5" /> Daily Reports
      </h2>

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Reports Yet"
          description="Daily reports will appear here as team members submit them."
        />
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold">
                        Report #{report.reportNumber} &mdash; {format(new Date(report.date), 'MMM d, yyyy')}
                      </h3>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', statusColors[report.status] || 'bg-muted text-muted-foreground')}>
                        {report.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Technician: {report.technicianName}</span>
                      {report.hoursOnSite && <span>Hours: {report.hoursOnSite}</span>}
                      {report.location && <span>Location: {report.location}</span>}
                    </div>
                    {report.workCompleted && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <strong>Work Completed:</strong> {report.workCompleted}
                      </p>
                    )}
                    {report.issuesEncountered && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <strong>Issues:</strong> {report.issuesEncountered}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Added by {getMemberName(report.createdBy)} &middot; {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
