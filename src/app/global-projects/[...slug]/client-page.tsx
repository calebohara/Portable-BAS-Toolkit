'use client';

import { useState, useMemo, use, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft, LayoutGrid, StickyNote, Server, Network, FileText, FolderOpen,
  History, Users, Plus, Trash2, Edit2, MapPin, Hash, Building2,
  Copy, Check, Clock, User, ChevronDown, ChevronUp, Pencil, FolderKanban,
  FileCode, Terminal, Pin, PinOff,
  Download, CloudOff, Phone, Mail, Eye, Database, ChevronRight, HardDrive, Cpu,
} from 'lucide-react';
import {
  useGlobalProject,
  useGlobalProjectMembers,
  useGlobalProjectNotes,
  useGlobalProjectDevices,
  useGlobalProjectIpPlan,
  useGlobalProjectFiles,
  useGlobalProjectReports,
  useGlobalProjectActivity,
  useGlobalProjectPpcl,
  useGlobalProjectTerminalLogs,
  useGlobalProjectPreferences,
  useGlobalProjectDxrs,
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
import { GlobalFileListView } from '@/components/global-projects/global-file-list-view';
import { GlobalDxrsView } from '@/components/global-projects/global-dxrs-view';
import { ContactDialog } from '@/components/projects/contact-dialog';
import { PpclPreviewDialog } from '@/components/ppcl-editor/ppcl-preview-dialog';
import type { FileCategory } from '@/types';
import { navigateToProject } from '@/lib/routes';
import { cn, copyToClipboard, sanitizeFilename } from '@/lib/utils';
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
  GlobalPpclDocument,
  GlobalTerminalSessionLog,
} from '@/types/global-projects';
import type { Contact, PpclDocument } from '@/types';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'panel-databases', label: 'Panel DBs', icon: Database },
  { id: 'wiring-diagrams', label: 'Wiring', icon: FileText },
  { id: 'sequences', label: 'Sequences', icon: FileText },
  { id: 'ip-plan', label: 'IP Plan', icon: Network },
  { id: 'devices', label: 'Devices', icon: Server },
  { id: 'dxrs', label: 'DXRs', icon: Cpu },
  { id: 'backups', label: 'Backups', icon: HardDrive },
  { id: 'general-documents', label: 'General Docs', icon: FolderOpen },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'ppcl-programs', label: 'PPCL', icon: FileCode },
  { id: 'terminal-logs', label: 'Terminal Logs', icon: Terminal },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'members', label: 'Members', icon: Users },
] as const;

const FILE_CATEGORY_TABS = new Set(['panel-databases', 'wiring-diagrams', 'sequences', 'backups', 'general-documents']);

export default function GlobalProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = use(params);
  const id = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('_id') || paramId)
    : paramId;
  const router = useRouter();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';

  const { project, loading, error: projectError, update: updateProject, remove: removeProject, leave: leaveProject } = useGlobalProject(id);
  const { members, removeMember, promoteMember, regenerateCode } = useGlobalProjectMembers(id);
  const { notes, addNote, updateNote, removeNote } = useGlobalProjectNotes(id);
  const { devices, addDevice, updateDevice, removeDevice } = useGlobalProjectDevices(id);
  const { dxrs } = useGlobalProjectDxrs(id);
  const { entries: ipEntries, addEntry: addIpEntry, updateEntry: updateIpEntry, removeEntry: removeIpEntry } = useGlobalProjectIpPlan(id);
  const { files, addFile, updateFile, removeFile } = useGlobalProjectFiles(id);
  const { reports, updateReport, removeReport } = useGlobalProjectReports(id);
  const { activity } = useGlobalProjectActivity(id);
  const { documents: ppclDocs, addDocument: addPpclDoc, removeDocument: removePpclDoc } = useGlobalProjectPpcl(id);
  const { logs: terminalLogs, removeLog: removeTerminalLog } = useGlobalProjectTerminalLogs(id);
  const {
    isPinned,
    isOfflineAvailable,
    update: updatePreferences,
  } = useGlobalProjectPreferences(id);

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
    // Sync local tab state from the URL (external system) on navigation.
    if (tab && validTabs.includes(tab)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing state from the URL ?tab= param on id change
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
          description={
            projectError
              ? `This project couldn't be loaded: ${projectError}. It may have been deleted, soft-deleted, or you don't have access. (Project id: ${id || 'missing'})`
              : "This project may have been deleted, or you don't have access."
          }
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
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              isPinned ? 'text-primary' : 'text-muted-foreground',
            )}
            onClick={async () => {
              try {
                await updatePreferences({ isPinned: !isPinned });
                toast.success(isPinned ? 'Unpinned' : 'Pinned to your projects');
              } catch {
                toast.error('Failed to update pin');
              }
            }}
            title={isPinned ? 'Unpin project' : 'Pin project'}
            aria-label={isPinned ? 'Unpin project' : 'Pin project'}
          >
            {isPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              isOfflineAvailable ? 'text-primary' : 'text-muted-foreground',
            )}
            onClick={async () => {
              try {
                await updatePreferences({ isOfflineAvailable: !isOfflineAvailable });
                toast.success(isOfflineAvailable ? 'Removed from offline cache' : 'Marked for offline cache');
              } catch {
                toast.error('Failed to update offline preference');
              }
            }}
            title={isOfflineAvailable ? 'Stop caching offline' : 'Cache for offline'}
            aria-label={isOfflineAvailable ? 'Stop caching offline' : 'Cache for offline'}
          >
            {isOfflineAvailable ? <Download className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
          </Button>
          <div className="hidden sm:flex items-center gap-2 pl-1">
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
      </TopBar>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
        {/* Tab Navigation */}
        <div className="border-b lg:border-b-0 lg:border-r border-border lg:w-48 shrink-0">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible p-2 gap-0.5 scrollbar-thin">
            {tabs.map(({ id: tabId, label, icon: Icon }) => {
              const count = tabId === 'notes' ? notes.length
                : tabId === 'devices' ? devices.length
                : tabId === 'dxrs' ? dxrs.length
                : tabId === 'ip-plan' ? ipEntries.length
                : FILE_CATEGORY_TABS.has(tabId) ? files.filter((f) => f.category === tabId).length
                : tabId === 'reports' ? reports.length
                : tabId === 'ppcl-programs' ? ppclDocs.length
                : tabId === 'terminal-logs' ? terminalLogs.length
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
              ipEntries={ipEntries}
              isAdmin={isAdmin}
              onNavigate={setActiveTab}
              onDelete={() => setShowDeleteConfirm(true)}
              onEditProject={() => setEditingProject(true)}
              onSaveToLocal={() => setShowSaveToLocal(true)}
              onUpdateProject={updateProject}
              getMemberName={getMemberName}
            />
          )}

          {activeTab === 'notes' && (
            <NotesTab
              notes={notes}
              files={files}
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

          {activeTab === 'dxrs' && (
            <GlobalDxrsView projectId={id} />
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

          {FILE_CATEGORY_TABS.has(activeTab) && (
            <GlobalFileListView
              projectId={id}
              category={activeTab as FileCategory}
              files={files.filter((f) => f.category === activeTab)}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              getMemberName={getMemberName}
              onAdd={addFile}
              onUpdate={updateFile}
              onRemove={removeFile}
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

          {activeTab === 'ppcl-programs' && (
            <GlobalPpclTab
              documents={ppclDocs}
              getMemberName={getMemberName}
              onAdd={addPpclDoc}
              onRemove={removePpclDoc}
            />
          )}

          {activeTab === 'terminal-logs' && (
            <GlobalTerminalLogsTab
              logs={terminalLogs}
              getMemberName={getMemberName}
              onRemove={removeTerminalLog}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityTab activity={activity} getMemberName={getMemberName} />
          )}

          {activeTab === 'members' && (
            <MemberManagement
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
          // Parent owns both success and error toasts; inner dialog only
          // surfaces saving state and keeps the form open on failure.
          try {
            await updateProject(data);
            toast.success('Project updated');
            setEditingProject(false);
          } catch {
            toast.error('Failed to update project');
            throw new Error('update-failed');
          }
        }}
      />

      <SaveToLocalDialog
        open={showSaveToLocal}
        onOpenChange={setShowSaveToLocal}
        project={project}
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
  ipEntries, isAdmin, onNavigate, onDelete, onEditProject, onSaveToLocal,
  onUpdateProject, getMemberName,
}: {
  project: NonNullable<ReturnType<typeof useGlobalProject>['project']>;
  memberCount: number;
  noteCount: number;
  deviceCount: number;
  ipEntryCount: number;
  reportCount: number;
  ipEntries: GlobalIpPlanEntry[];
  isAdmin: boolean;
  onNavigate: (tab: string) => void;
  onDelete: () => void;
  onEditProject: () => void;
  onSaveToLocal: () => void;
  onUpdateProject: (data: Partial<GlobalProject>) => Promise<void>;
  getMemberName: (id: string) => string;
}) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState('');
  const [editingTechNotes, setEditingTechNotes] = useState(false);
  const [techNotesDraft, setTechNotesDraft] = useState('');
  const [editingPanelRoster, setEditingPanelRoster] = useState(false);
  const [panelRosterDraft, setPanelRosterDraft] = useState('');
  const [editingNetworkSummary, setEditingNetworkSummary] = useState(false);
  const [networkSummaryDraft, setNetworkSummaryDraft] = useState('');
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<{ contact: Contact; index: number } | undefined>();
  const [deleteContactIndex, setDeleteContactIndex] = useState<number | null>(null);

  const contacts = project.contacts ?? [];

  // Derived network stats from IP entries
  const networkStats = useMemo(() => {
    if (ipEntries.length === 0) return null;
    const subnets = [...new Set(ipEntries.map(e => e.subnet).filter(Boolean))];
    const vlans = [...new Set(ipEntries.map(e => e.vlan).filter(Boolean))];
    return { total: ipEntries.length, subnets: subnets.length, vlans: vlans.length };
  }, [ipEntries]);

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

  const safeUpdate = async (data: Partial<GlobalProject>, successMsg?: string) => {
    try {
      await onUpdateProject(data);
      if (successMsg) toast.success(successMsg);
    } catch {
      toast.error('Failed to update project');
    }
  };

  const handleSaveContact = (contact: Contact) => {
    const next = [...contacts];
    if (editContact) {
      next[editContact.index] = contact;
    } else {
      next.push(contact);
    }
    safeUpdate({ contacts: next }, editContact ? 'Contact updated' : 'Contact added');
    setEditContact(undefined);
  };

  const handleDeleteContact = () => {
    if (deleteContactIndex === null) return;
    const next = contacts.filter((_, i) => i !== deleteContactIndex);
    safeUpdate({ contacts: next }, 'Contact removed');
    setDeleteContactIndex(null);
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
            {/* Customer Name — inline editable */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Customer</p>
                  {editingCustomer ? (
                    <div className="mt-1 space-y-2">
                      <Input
                        value={customerDraft}
                        onChange={(e) => setCustomerDraft(e.target.value)}
                        placeholder="Customer name"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingCustomer(false)}>Cancel</Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await safeUpdate({ customerName: customerDraft.trim() }, 'Customer updated');
                            setEditingCustomer(false);
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : project.customerName ? (
                    <p className="text-sm">{project.customerName}</p>
                  ) : (
                    <button
                      onClick={() => { setCustomerDraft(''); setEditingCustomer(true); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
                    >
                      <Plus className="h-3 w-3" /> Add customer name
                    </button>
                  )}
                </div>
                {!editingCustomer && project.customerName && (
                  <button
                    onClick={() => { setCustomerDraft(project.customerName); setEditingCustomer(true); }}
                    className="rounded p-1 hover:bg-muted shrink-0"
                    title="Edit customer"
                  >
                    <Edit2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            {project.description && (
              <div className="pt-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Description</p>
                <p className="text-sm whitespace-pre-wrap">{project.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contacts Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Contacts
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => { setEditContact(undefined); setContactDialogOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No contacts added. Add site contacts like GC, mechanical, or TAB.
              </p>
            ) : (
              <div className="space-y-3">
                {contacts.map((contact, i) => (
                  <div key={i} className="group flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {contact.role}{contact.company ? ` — ${contact.company}` : ''}
                      </p>
                      {contact.phone && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />{contact.phone}
                        </p>
                      )}
                      {contact.email && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />{contact.email}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => { setEditContact({ contact, index: i }); setContactDialogOpen(true); }}
                        className="rounded p-1.5 hover:bg-muted"
                        title="Edit"
                      >
                        <Edit2 className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteContactIndex(i)}
                        className="rounded p-1.5 hover:bg-muted"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3 text-field-danger" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Panel Roster + Network Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" /> Panel Roster
              </CardTitle>
              {!editingPanelRoster && (
                <button
                  onClick={() => { setPanelRosterDraft(project.panelRosterSummary || ''); setEditingPanelRoster(true); }}
                  className="rounded p-1.5 hover:bg-muted"
                  title="Edit"
                >
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingPanelRoster ? (
              <div className="space-y-2">
                <Textarea
                  value={panelRosterDraft}
                  onChange={(e) => setPanelRosterDraft(e.target.value)}
                  placeholder="e.g. PXC36-AHU1, PXC36-AHU2, PXC100-Main, JACE-8000..."
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingPanelRoster(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await safeUpdate(
                        { panelRosterSummary: panelRosterDraft.trim() || null },
                        'Panel roster updated',
                      );
                      setEditingPanelRoster(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : project.panelRosterSummary ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.panelRosterSummary}</p>
            ) : (
              <button
                onClick={() => { setPanelRosterDraft(''); setEditingPanelRoster(true); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add panel roster details
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" /> Network Summary
              </CardTitle>
              {!editingNetworkSummary && (
                <button
                  onClick={() => { setNetworkSummaryDraft(project.networkSummary || ''); setEditingNetworkSummary(true); }}
                  className="rounded p-1.5 hover:bg-muted"
                  title="Edit"
                >
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {networkStats && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-base sm:text-lg font-bold">{networkStats.total}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">IPs</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-base sm:text-lg font-bold">{networkStats.subnets}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Subnets</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-base sm:text-lg font-bold">{networkStats.vlans}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">VLANs</p>
                </div>
              </div>
            )}
            {editingNetworkSummary ? (
              <div className="space-y-2">
                <Textarea
                  value={networkSummaryDraft}
                  onChange={(e) => setNetworkSummaryDraft(e.target.value)}
                  placeholder="e.g. BACnet/IP via JACE-8000, MS/TP trunks on AHU panels..."
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingNetworkSummary(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await safeUpdate(
                        { networkSummary: networkSummaryDraft.trim() || null },
                        'Network summary updated',
                      );
                      setEditingNetworkSummary(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : project.networkSummary ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
                {project.networkSummary}
              </p>
            ) : (
              <button
                onClick={() => { setNetworkSummaryDraft(''); setEditingNetworkSummary(true); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add network summary
              </button>
            )}
            {networkStats && (
              <button
                onClick={() => onNavigate('ip-plan')}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View full IP plan <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Technician Notes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Technician Notes</CardTitle>
            {!editingTechNotes && (
              <button
                onClick={() => { setTechNotesDraft(project.technicianNotes || ''); setEditingTechNotes(true); }}
                className="rounded p-1.5 hover:bg-muted"
                title="Edit"
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingTechNotes ? (
            <div className="space-y-2">
              <Textarea
                value={techNotesDraft}
                onChange={(e) => setTechNotesDraft(e.target.value)}
                placeholder="Project-level technician notes visible to all members..."
                rows={4}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingTechNotes(false)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await safeUpdate(
                      { technicianNotes: techNotesDraft.trim() },
                      'Technician notes updated',
                    );
                    setEditingTechNotes(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : project.technicianNotes ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.technicianNotes}</p>
          ) : (
            <button
              onClick={() => { setTechNotesDraft(''); setEditingTechNotes(true); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add technician notes
            </button>
          )}
        </CardContent>
      </Card>

      {/* Access Code (admin only) */}
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

      {/* Contact editor dialog (reused from local projects) */}
      <ContactDialog
        open={contactDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setContactDialogOpen(false);
            setEditContact(undefined);
          } else {
            setContactDialogOpen(true);
          }
        }}
        contact={editContact?.contact}
        onSave={handleSaveContact}
      />

      <ConfirmDialog
        open={deleteContactIndex !== null}
        onOpenChange={(open) => { if (!open) setDeleteContactIndex(null); }}
        title="Delete Contact"
        description={`Remove "${contacts[deleteContactIndex ?? 0]?.name ?? ''}" from this project?`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteContact}
      />
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
    name: '', jobSiteName: '', customerName: '', siteAddress: '', buildingArea: '',
    projectNumber: '', description: '', technicianNotes: '', panelRosterSummary: '',
    networkSummary: '', status: 'active' as string, tags: '',
  });

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        jobSiteName: project.jobSiteName || '',
        customerName: project.customerName || '',
        siteAddress: project.siteAddress || '',
        buildingArea: project.buildingArea || '',
        projectNumber: project.projectNumber || '',
        description: project.description || '',
        technicianNotes: project.technicianNotes || '',
        panelRosterSummary: project.panelRosterSummary || '',
        networkSummary: project.networkSummary || '',
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
        customerName: form.customerName.trim(),
        siteAddress: form.siteAddress.trim(),
        buildingArea: form.buildingArea.trim(),
        projectNumber: form.projectNumber.trim(),
        description: form.description.trim(),
        technicianNotes: form.technicianNotes.trim(),
        panelRosterSummary: form.panelRosterSummary.trim() || null,
        networkSummary: form.networkSummary.trim() || null,
        status: form.status as GlobalProjectStatus,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
    } catch {
      // Error toast is owned by the parent onSubmit wrapper; swallow here so we
      // don't double-toast. The dialog stays open because we never closed it.
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
                <Label htmlFor="edit-proj-customer">Customer Name</Label>
                <Input id="edit-proj-customer" value={form.customerName} onChange={(e) => updateField('customerName', e.target.value)} />
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-proj-tech-notes">Technician Notes</Label>
                <Textarea id="edit-proj-tech-notes" value={form.technicianNotes} onChange={(e) => updateField('technicianNotes', e.target.value)} rows={3} placeholder="Project-level technician notes visible to all members..." />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-proj-panel-roster">Panel Roster Summary</Label>
                <Textarea id="edit-proj-panel-roster" value={form.panelRosterSummary} onChange={(e) => updateField('panelRosterSummary', e.target.value)} rows={2} placeholder="e.g. PXC36-AHU1, PXC36-AHU2, PXC100-Main, JACE-8000..." />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-proj-network-summary">Network Summary</Label>
                <Textarea id="edit-proj-network-summary" value={form.networkSummary} onChange={(e) => updateField('networkSummary', e.target.value)} rows={2} placeholder="e.g. BACnet/IP via JACE-8000, MS/TP trunks on AHU panels..." />
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
  notes, files, getMemberName, onAdd, onUpdate, onRemove,
}: {
  notes: GlobalFieldNote[];
  files: GlobalProjectFile[];
  getMemberName: (id: string) => string;
  onAdd: (data: Omit<GlobalFieldNote, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<GlobalFieldNote>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GlobalFieldNote | null>(null);

  const handleAdd = async (content: string, category: string, fileId: string | null) => {
    try {
      await onAdd({
        content,
        category: category as GlobalFieldNote['category'],
        isPinned: false,
        tags: [],
        fileId,
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

      <AddNoteDialog open={showAdd} onOpenChange={setShowAdd} files={files} onSubmit={handleAdd} />

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

function AddNoteDialog({ open, onOpenChange, files, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; files: GlobalProjectFile[]; onSubmit: (content: string, category: string, fileId: string | null) => Promise<void> }) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [fileId, setFileId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSubmit(content.trim(), category, fileId || null);
      setContent('');
      setCategory('general');
      setFileId('');
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
            {files.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="note-file">Attach to file (optional)</Label>
                <select
                  id="note-file"
                  value={fileId}
                  onChange={(e) => setFileId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— None (project-level note) —</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>{f.title || f.fileName}</option>
                  ))}
                </select>
              </div>
            )}
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
          try {
            await onUpdate(editTarget.id, data);
            setEditTarget(null);
            toast.success('Device updated');
          } catch {
            toast.error('Failed to update device');
            throw new Error('update-failed');
          }
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
      // Error toast owned by parent onSubmit wrapper; swallow to avoid double-toast.
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
          try {
            await onUpdate(editTarget.id, data);
            setEditTarget(null);
            toast.success('IP entry updated');
          } catch {
            toast.error('Failed to update IP entry');
            throw new Error('update-failed');
          }
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
      // Error toast owned by parent onSubmit wrapper; swallow to avoid double-toast.
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
    // Parent owns both toasts; rethrow so the inner dialog stays open on failure.
    try {
      await onUpdate(id, data);
      setEditTarget(null);
      toast.success('Report updated');
    } catch {
      toast.error('Failed to update report');
      throw new Error('update-failed');
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
      // Error toast owned by parent onSubmit wrapper; swallow to avoid double-toast.
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

// ─── Global PPCL Tab ─────────────────────────────────────────────────────────

function GlobalPpclTab({
  documents, getMemberName, onAdd, onRemove,
}: {
  documents: GlobalPpclDocument[];
  getMemberName: (id: string) => string;
  onAdd: (data: { name: string; content: string; firmware: PpclDocument['firmware'] }) => Promise<unknown>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalPpclDocument | null>(null);
  const previewDoc = previewDocId ? documents.find((d) => d.id === previewDocId) ?? null : null;

  // Adapt a GlobalPpclDocument to the PpclDocument shape that PpclPreviewDialog expects.
  const previewAdapter: PpclDocument | null = previewDoc
    ? {
        id: previewDoc.id,
        name: previewDoc.name,
        content: previewDoc.content,
        // PpclDocument expects projectId; we don't have a local project here, so use empty string.
        projectId: '',
        firmware: previewDoc.firmware,
        createdAt: previewDoc.createdAt,
        updatedAt: previewDoc.updatedAt,
      }
    : null;

  const handleNew = async () => {
    try {
      await onAdd({ name: 'Untitled.pcl', content: '', firmware: 'pxc-tc' });
      toast.success('PPCL program created');
    } catch {
      toast.error('Failed to create PPCL program');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete program');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileCode className="h-5 w-5" /> PPCL Programs
        </h2>
        <Button size="sm" className="gap-1.5" onClick={handleNew}>
          <Plus className="h-4 w-4" /> New Program
        </Button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileCode}
          title="No PPCL Programs"
          description="Create a new PPCL program. The global PPCL editor is read-only for now — use Preview / Download to inspect content."
          action={
            <Button size="sm" className="gap-1.5" onClick={handleNew}>
              <Plus className="h-4 w-4" /> New Program
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <FileCode className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(doc.updatedAt), 'MMM d, h:mm a')}
                    <span className="ml-2 uppercase">{doc.firmware}</span>
                    <span className="ml-2">by {getMemberName(doc.createdBy)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setPreviewDocId(doc.id)}
                    aria-label={`Preview ${doc.name}`}
                    title="Preview program"
                  >
                    <Eye className="h-3 w-3" /> Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(doc)}
                    title="Delete program"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview dialog reused from local PPCL viewer. */}
      {/* "Open in Editor" is wired to a no-op because the editor route is local-only. */}
      <PpclPreviewDialog
        open={previewDocId !== null}
        onOpenChange={(o) => { if (!o) setPreviewDocId(null); }}
        document={previewAdapter}
        onOpenInEditor={() => {
          toast.info('The PPCL editor is currently local-only. Use Save to My Projects, then open the program from the local project.');
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete PPCL Program"
        description={`Permanently delete "${deleteTarget?.name ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─── Global Terminal Logs Tab ────────────────────────────────────────────────

function GlobalTerminalLogsTab({
  logs, getMemberName, onRemove,
}: {
  logs: GlobalTerminalSessionLog[];
  getMemberName: (id: string) => string;
  onRemove: (id: string) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDownload = (log: GlobalTerminalSessionLog) => {
    const blob = new Blob([log.logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const mode = log.connectionMode === 'serial' ? 'serial' : 'telnet';
    a.download = sanitizeFilename(`${log.sessionLabel}_${mode}_${format(new Date(log.createdAt), 'yyyy-MM-dd_HH-mm')}`) + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onRemove(id);
      toast.success('Terminal log deleted');
    } catch {
      toast.error('Failed to delete log');
    }
    setDeletingId(null);
  };

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={Terminal}
        title="No Terminal Logs"
        description="Terminal session logs attached to this global project will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Terminal className="h-5 w-5" /> Terminal Session Logs
        </h2>
        <Badge variant="secondary">{logs.length} log{logs.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="space-y-2">
        {logs.map((log) => {
          const isSerial = log.connectionMode === 'serial';
          const connectionInfo = isSerial
            ? `${log.serialPort} @ ${log.baudRate} baud`
            : `${log.host}:${log.port}`;
          const isExpanded = expandedId === log.id;

          return (
            <Card key={log.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{log.sessionLabel}</h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {isSerial ? 'Serial' : 'Telnet'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{connectionInfo}</span>
                      <span>{log.lineCount} lines</span>
                      <span>{format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}</span>
                      <span>by {getMemberName(log.createdBy)}</span>
                    </div>
                    {log.startedAt && log.endedAt && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(log.startedAt), 'h:mm:ss a')} — {format(new Date(log.endedAt), 'h:mm:ss a')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      title={isExpanded ? 'Collapse' : 'View log'}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleDownload(log)}
                      title="Download log"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(log.id)}
                      disabled={deletingId === log.id}
                      title="Delete log"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#0d1117] p-3 font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {log.logContent}
                  </pre>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
